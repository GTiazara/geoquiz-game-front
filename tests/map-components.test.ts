import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import L from 'leaflet'
import GeoMap from '../src/components/GeoMap.vue'
import AdminThemeQuestionsMap from '../src/components/AdminThemeQuestionsMap.vue'
import AdminGeojsonPreview from '../src/components/AdminGeojsonPreview.vue'

const maps: L.Map[] = []
const wrappers: ReturnType<typeof mount>[] = []
const fetchMock = vi.fn()
const originalMap = L.map
const originalSvg = L.Browser.svg

beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGRect', { configurable: true, value: () => ({}) })
  Object.defineProperty(L.Browser, 'svg', { configurable: true, value: true })
})
afterAll(() => {
  Object.defineProperty(L.Browser, 'svg', { configurable: true, value: originalSvg })
  Reflect.deleteProperty(SVGSVGElement.prototype, 'createSVGRect')
})
beforeEach(() => {
  vi.spyOn(L, 'map').mockImplementation((...args) => {
    const map = originalMap(...args)
    maps.push(map)
    return map
  })
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  maps.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
function mountMap(props: Record<string, unknown> = {}) {
  const wrapper = mount(GeoMap, { props: { borders: false, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}
function correctionMarker() {
  let marker: L.Marker | undefined
  maps[0]!.eachLayer((layer) => { if (layer instanceof L.Marker && layer.getPopup()) marker = layer })
  expect(marker).toBeDefined()
  marker!.openPopup()
  return marker!
}

describe('ported Leaflet maps', () => {
  it('mounts without proxying Leaflet, emits guesses and keeps pan/zoom when noninteractive', async () => {
    const adminClick = vi.fn()
    const wrapper = mountMap({ onAdminMapClick: adminClick })
    await nextTick()
    const map = maps[0]!
    map.fire('click', { latlng: L.latLng(48, 2) })
    expect(wrapper.emitted('update:guess')).toEqual([[{ lat: 48, lng: 2 }]])
    expect(adminClick).toHaveBeenCalledWith({ lat: 48, lng: 2 })
    await wrapper.setProps({ interactive: false, guess: { lat: 49, lng: 3 } })
    map.fire('click', { latlng: L.latLng(50, 4) })
    expect(wrapper.emitted('update:guess')).toHaveLength(1)
    expect(map.dragging.enabled()).toBe(true)
    expect(wrapper.attributes('translate')).toBe('no')
    await wrapper.setProps({ allowOverlayTranslation: true })
    expect(wrapper.attributes('translate')).toBe('yes')
  })

  it('switches selector and label-free overlay controls reactively', async () => {
    const wrapper = mountMap({ showBasemapSelector: false })
    await nextTick()
    expect(wrapper.find('.leaflet-control-layers').exists()).toBe(false)
    await wrapper.find('.gp-voyager-overlay-ctl__btn').trigger('click')
    expect(wrapper.find('.gp-voyager-overlay-ctl__btn').attributes('aria-pressed')).toBe('true')
    await wrapper.setProps({ showBasemapSelector: true })
    expect(wrapper.find('.leaflet-control-layers').exists()).toBe(true)
  })

  it('renders participant guesses, polygon answer zones and correction media forms', async () => {
    const saved = vi.fn()
    const wrapper = mountMap({
      showResult: true, answer: { lat: 48, lng: 2 }, resultFitAutoBounds: false,
      answerArea: { type: 'Polygon', coordinates: [[[1, 47], [3, 47], [3, 49], [1, 47]]] },
      participantGuessMarkers: [{ label: 'Moi', lat: 47, lng: 2, isSelf: true }],
      onCorrectionMediaSaved: saved,
      correctionPopup: { title: 'Paris', questionId: 'q1', mediaEditable: true, description: 'Description' },
    })
    await nextTick()
    correctionMarker()
    await nextTick()
    expect(wrapper.find('.gp-participant-guess-tt').text()).toBe('Moi')
    await wrapper.find('.gp-correction-popup__media-toggle').trigger('click')
    await wrapper.find('.gp-correction-popup__in-img').setValue('https://example.test/photo.jpg')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ question: { id: 'q1' } }), { status: 200 }))
    await wrapper.find('.gp-correction-popup__media-update').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/q1/media', expect.objectContaining({ method: 'PATCH' }))
    expect(saved).toHaveBeenCalledWith({ id: 'q1' })
  })

  it('submits community proposals to the exact API route and cleans up their mini-map', async () => {
    const submitted = vi.fn()
    const wrapper = mountMap({
      showResult: true, answer: { lat: 48, lng: 2 }, resultFitAutoBounds: false,
      onCommunityEditProposalSubmitted: submitted,
      correctionPopup: { title: 'Paris', questionId: 'q2', contentProposalEditable: true,
        proposalBaseline: { text: 'Une question', lat: 48, lng: 2, description: 'Description' } },
    })
    await nextTick()
    const marker = correctionMarker()
    await nextTick()
    await wrapper.find('.gp-correction-popup__proposal-toggle').trigger('click')
    await flushPromises()
    expect(maps).toHaveLength(2)
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await wrapper.find('.gp-correction-popup__proposal-send').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/q2/edit-proposal', expect.objectContaining({ method: 'POST' }))
    expect(submitted).toHaveBeenCalledOnce()
    const remove = vi.spyOn(maps[1]!, 'remove')
    marker.closePopup()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('reveals story markers only after resolution, with base-aware mascot assets', async () => {
    const wrapper = mountMap({
      storyEnabled: true, storyLayerWithResult: true, storyRevealOnResolve: true,
      storyActiveStepIndex: 0, storySteps: [{ id: 's1', lat: 48, lng: 2, title: 'Étape' }],
    })
    await nextTick()
    expect(wrapper.find('.gp-story-penguin-wrap').exists()).toBe(false)
    await wrapper.setProps({ showResult: true, storyResolvedStepIds: ['s1'] })
    await flushPromises()
    expect(wrapper.find('.gp-story-penguin-wrap img').attributes('src')).toBe(`${import.meta.env.BASE_URL}mascot/mascot.jpg`)
  })

  it('loads external borders only when enabled and aborts work when disabled', async () => {
    const wrapper = mountMap()
    await nextTick()
    expect(fetchMock).not.toHaveBeenCalled()
    await wrapper.setProps({ borders: true })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ne_110m_admin_0_countries.geojson'), expect.any(Object))
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal
    await wrapper.setProps({ borders: false })
    expect(signal.aborted).toBe(true)
  })

  it('mounts both admin maps and refreshes GeoJSON validation/counts', async () => {
    const theme = mount(AdminThemeQuestionsMap, { props: { questions: [] }, attachTo: document.body })
    const preview = mount(AdminGeojsonPreview, { props: { text: '{' }, attachTo: document.body })
    wrappers.push(theme, preview)
    await nextTick()
    expect(theme.text()).toContain('0 point')
    expect(preview.text()).toContain('JSON invalide')
    await preview.setProps({ text: JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: { text: 'Paris' } },
    ] }) })
    expect(preview.text()).toContain('2 éléments géométriques')
    await preview.setProps({ text: '' })
    expect(preview.text()).not.toContain('élément')
  })
})

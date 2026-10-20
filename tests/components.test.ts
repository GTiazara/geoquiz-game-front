import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeStars from '../src/components/ThemeStars.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import HistoryAdventureCover from '../src/components/HistoryAdventureCover.vue'

describe('shared components', () => {
  it('renders a partial amber star average', () => {
    const wrapper = mount(ThemeStars, { props: { avg: 3.5 } })
    expect(wrapper.findAll('button')).toHaveLength(5)
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.html()).toContain('width: 50%')
  })

  it('emits the bound open state when confirming is dismissed', async () => {
    const wrapper = mount(ConfirmDialog, { attachTo: document.body, props: { open: true, title: 'Supprimer ?', description: 'Cette action est définitive.' } })
    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('Supprimer ?')
    document.querySelector('.modal-footer button')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows a fallback emoji when no cover image is provided', () => {
    const wrapper = mount(HistoryAdventureCover, { props: { emoji: '🏛️', title: 'Antiquité' } })
    expect(wrapper.text()).toContain('🏛️')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.sr-only').text()).toBe('Antiquité')
  })
})

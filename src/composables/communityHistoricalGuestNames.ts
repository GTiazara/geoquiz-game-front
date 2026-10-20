/**
 * Bases de pseudo « visiteur » et suggestions aléatoires : figures ou époques connues, ton léger (pas de données réelles).
 * Partagé entre le serveur (`guest_user`) et le client (onboarding).
 */
export const HISTORICAL_GUEST_NICKS = [
	// Antiquité & monde ancien
	'Pytheas',
	'Hypatie',
	'Archimède',
	'Hannibal',
	'Spartacus',
	'Boudicca',
	'Vercingétorix',
	'Cléopâtre',
	'Ramsès',
	'Néfertiti',
	'Akhenaton',
	'Hammurabi',
	'Sénèque',
	'Cicéron',
	'Léonidas',
	'Périclès',
	'Alexandre',
	'Pyrrhus',
	'Socrate',
	'Platon',
	'Hérodote',
	'Thucydide',
	'Toutânkhamon',
	'Hatchepsout',
	// Moyen Âge & Renaissance
	'Charlemagne',
	'Aliénor',
	'JeanneArc',
	'Richelieu',
	'Machiavel',
	'Borgia',
	'Gutenberg',
	'Copernic',
	'Galilée',
	// Grandes découvertes & aventuriers
	'MarcoPolo',
	'IbnBattuta',
	'ZhengHe',
	'Magellan',
	'VascoDaGama',
	'Drake',
	'Bougainville',
	'Livingstone',
	'Stanley',
	// Lumières & révolutions
	'Voltaire',
	'Rousseau',
	'Robespierre',
	'Napoléon',
	'Joséphine',
	'Toussaint',
	'Bolivar',
	// Science & XIXe
	'MarieCurie',
	'PierreCurie',
	'Pasteur',
	'Darwin',
	'AdaLovelace',
	'FlorenceNight',
	'Tesla',
	// XXe & figures iconiques
	'Gandhi',
	'Mandela',
	'Churchill',
	'Lincoln',
	'Turing',
	'Newton',
	'Euler',
	'Catherine2',
	'Frédéric2',
	// Orient & sagesses (nick courts)
	'Confucius',
	'SunTzu',
	'Miyamoto',
	// Petit clin d’œil carto / exploration
	'Pausanias',
	'Strabon',
	'Ératosthène',
	'Trajan',
	'Auguste',
	'MarcAurèle'
] as const;

export function pickHistoricalGuestBase(): string {
	const list = HISTORICAL_GUEST_NICKS;
	return list[Math.floor(Math.random() * list.length)]!;
}

const entries = (cicustom) => (cicustom || '').split(',').filter(Boolean);
const entryType = (entry) => entry.split('=', 1)[0];

export function hasUserSnippet(cicustom) {
    return entries(cicustom).some((entry) => entryType(entry) === 'user');
}

export function withUserSnippet(cicustom, volumeId) {
    const others = entries(cicustom).filter((entry) => entryType(entry) !== 'user');
    return [...others, `user=${volumeId}`].join(',');
}

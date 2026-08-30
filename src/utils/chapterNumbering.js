const outerNumber = value => String(Math.max(1, Number(value) || 1));

export function renumberChapterText(value = '', chapterNumber = 1) {
  const number = outerNumber(chapterNumber);
  return value.replace(/(^|\n)\s*\d+(\.\d+(?:\.\d+)*)(?=\s)/g, (_, start, suffix) => `${start}${number}${suffix}`);
}

export function renumberChapterHtml(value = '', chapterNumber = 1) {
  const number = outerNumber(chapterNumber);
  return value.replace(/(^|>)\s*\d+(\.\d+(?:\.\d+)*)(?=\s|&nbsp;)/g, (_, start, suffix) => `${start}${number}${suffix}`);
}

export function renumberSection(section, chapterNumber) {
  if (!section) return section;
  return {
    ...section,
    customNumber: String(chapterNumber).padStart(2, '0'),
    content: renumberChapterText(section.content || '', chapterNumber),
    html: renumberChapterHtml(section.html || '', chapterNumber),
  };
}

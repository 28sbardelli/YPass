const MYMEMORY_TRANSLATE_URL = 'https://api.mymemory.translated.net/get';

function sourceLanguage(text) {
  return /[\u3400-\u9fff]/u.test(text) ? 'zh-CN' : 'en';
}

export function createMyMemoryTranslate() {
  return {
    enabled: true,

    async translate(texts, target = 'es') {
      const translations = await Promise.all(
        texts.map(async (text) => {
          const query = new URLSearchParams({
            q: text,
            langpair: `${sourceLanguage(text)}|${target}`,
          });
          const response = await fetch(`${MYMEMORY_TRANSLATE_URL}?${query}`);
          if (!response.ok) {
            const error = new Error(`Translation request failed with status ${response.status}.`);
            error.status = response.status >= 500 ? 502 : 400;
            throw error;
          }

          const payload = await response.json();
          const translatedText = payload.responseData?.translatedText;
          if (typeof translatedText !== 'string') {
            const error = new Error('Translation service returned an invalid response.');
            error.status = 502;
            throw error;
          }
          return translatedText;
        }),
      );

      return translations;
    },
  };
}
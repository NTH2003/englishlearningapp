export function createStorageTopicsOps({
  getFirebase,
  normalizeTopicsList,
  getSessionTopics,
  setSessionTopics,
}) {
  const withTimeout = (promise, ms, fallbackValue) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
    ]);

  const getTopics = async (defaultTopics = []) => {
    const normalizedDefault = normalizeTopicsList(
      Array.isArray(defaultTopics) ? defaultTopics : [],
    );
    const fallback = normalizedDefault;
    const sessionTopics = getSessionTopics();
    const safeFallback =
      Array.isArray(sessionTopics) && sessionTopics.length > 0
        ? sessionTopics
        : fallback;

    const fb = getFirebase();
    if (fb) {
      try {
        const combined = await withTimeout(fb.getTopics(), 4500, null);
        const normalizedCombined = normalizeTopicsList(combined);
        if (normalizedCombined.length > 0) {
          setSessionTopics(normalizedCombined);
          return normalizedCombined;
        }

        await new Promise((r) => setTimeout(r, 1200));
        const retry = await withTimeout(fb.getTopics(), 3500, null);
        const normalizedRetry = normalizeTopicsList(retry);
        if (normalizedRetry.length > 0) {
          setSessionTopics(normalizedRetry);
          return normalizedRetry;
        }
      } catch (_) {}
      return safeFallback;
    }
    return safeFallback;
  };

  const saveTopics = async (topics) => {
    const fb = getFirebase();
    if (!fb) {
      return {
        ok: false,
        error:
          'Firebase chưa cấu hình. Thêm google-services.json và bật Auth + Firestore.',
      };
    }
    try {
      return await fb.saveTopics(topics);
    } catch (e) {
      return {ok: false, error: e?.message || 'Lỗi khi lưu.'};
    }
  };

  return {getTopics, saveTopics};
}

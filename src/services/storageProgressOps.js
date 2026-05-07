export function createStorageProgressOps({
  getFirebase,
  getLearningProgress,
  saveLearningProgress,
  defaultLearningProgress,
  computeLevelName,
}) {
  const addVideoWatched = async (videoId) => {
    const fb = getFirebase();
    if (fb) {
      try {
        if (await fb.addVideoWatched(videoId)) return true;
      } catch (_) {}
    }
    try {
      const progress = await getLearningProgress();
      const updated = progress || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
      };
      if (!Array.isArray(updated.videosWatched)) {
        updated.videosWatched = [];
      }
      if (!updated.videosWatched.includes(videoId)) {
        updated.videosWatched.push(videoId);
        await saveLearningProgress(updated);
      }
      return true;
    } catch (error) {
      console.error('Error adding video watched:', error);
      return false;
    }
  };

  const setVideoNeedsPractice = async (videoId, needsPractice = true) => {
    if (videoId == null) return false;
    const key = String(videoId);
    try {
      const progress = (await getLearningProgress()) || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
        videosNeedPractice: [],
      };
      const current = Array.isArray(progress.videosNeedPractice)
        ? progress.videosNeedPractice.map((id) => String(id))
        : [];
      const set = new Set(current);
      if (needsPractice) set.add(key);
      else set.delete(key);

      const watched = Array.isArray(progress.videosWatched)
        ? progress.videosWatched.map((id) => String(id))
        : [];
      const watchedSet = new Set(watched);
      if (needsPractice) watchedSet.add(key);
      return await saveLearningProgress({
        ...progress,
        videosNeedPractice: [...set],
        videosWatched: [...watchedSet],
      });
    } catch (e) {
      console.warn('setVideoNeedsPractice', e?.message);
      return false;
    }
  };

  const formatVideoViewCount = (n) => {
    const x = Math.max(0, Math.floor(Number(n) || 0));
    if (x >= 1_000_000) {
      const v = x / 1_000_000;
      return `${v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (x >= 1_000) {
      const v = x / 1_000;
      return `${v >= 10 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return String(x);
  };

  const incrementVideoViewCount = async (videoId) => {
    if (videoId == null) return false;
    const key = String(videoId);
    try {
      const progress = (await getLearningProgress()) || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
      };
      const prev =
        progress.videoViewCounts && typeof progress.videoViewCounts === 'object'
          ? progress.videoViewCounts
          : {};
      const nextCount = (Number(prev[key]) || 0) + 1;
      return await saveLearningProgress({
        ...progress,
        videoViewCounts: {...prev, [key]: nextCount},
      });
    } catch (e) {
      console.warn('incrementVideoViewCount', e?.message);
      return false;
    }
  };

  const completeVideoAndAwardXP = async (videoId, xpPoints = 0) => {
    if (videoId == null) return false;
    const vid = String(videoId);
    const pts = Math.max(0, Math.floor(Number(xpPoints) || 0));
    try {
      const progress = (await getLearningProgress()) || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
      };
      const watchedSet = new Set(
        Array.isArray(progress.videosWatched)
          ? progress.videosWatched.map((id) => String(id))
          : [],
      );
      const flags =
        progress.xpEventFlags && typeof progress.xpEventFlags === 'object'
          ? {...progress.xpEventFlags}
          : {};
      const eventKey = `video_watch_complete_${vid}`;
      const shouldAward = pts > 0 && !flags[eventKey];
      if (shouldAward) flags[eventKey] = Date.now();
      watchedSet.add(vid);
      const totalXP = shouldAward
        ? Math.max(0, Number(progress.totalXP) || 0) + pts
        : Math.max(0, Number(progress.totalXP) || 0);
      return await saveLearningProgress({
        ...progress,
        videosWatched: [...watchedSet],
        totalXP,
        level: computeLevelName(totalXP),
        xpEventFlags: flags,
      });
    } catch (e) {
      console.warn('completeVideoAndAwardXP', e?.message);
      return false;
    }
  };

  const awardXPIfFirst = async (eventKey, points) => {
    const key = String(eventKey || '').trim();
    const pts = Math.max(0, Math.floor(Number(points) || 0));
    if (!key || pts <= 0) return false;
    try {
      const progress = (await getLearningProgress()) || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
      };
      const flags =
        progress.xpEventFlags && typeof progress.xpEventFlags === 'object'
          ? {...progress.xpEventFlags}
          : {};
      if (flags[key]) return false;
      flags[key] = Date.now();
      const totalXP = Math.max(0, Number(progress.totalXP) || 0) + pts;
      const ok = await saveLearningProgress({
        ...progress,
        totalXP,
        level: computeLevelName(totalXP),
        xpEventFlags: flags,
      });
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  };

  const awardXPRepeatable = async (
    eventBaseKey,
    firstPoints = 0,
    repeatPoints = 0,
  ) => {
    const key = String(eventBaseKey || '').trim();
    if (!key) return 0;
    const first = Math.max(0, Math.floor(Number(firstPoints) || 0));
    const repeat = Math.max(0, Math.floor(Number(repeatPoints) || 0));
    if (first <= 0 && repeat <= 0) return 0;
    try {
      const progress = (await getLearningProgress()) || {
        wordsLearned: [],
        lessonsCompleted: [],
        videosWatched: [],
      };
      const counts =
        progress.xpPracticeCounts && typeof progress.xpPracticeCounts === 'object'
          ? {...progress.xpPracticeCounts}
          : {};
      const attemptCount = Math.max(0, Number(counts[key]) || 0);
      const gain = attemptCount === 0 ? first : repeat;
      if (gain <= 0) return 0;
      counts[key] = attemptCount + 1;
      const totalXP = Math.max(0, Number(progress.totalXP) || 0) + gain;
      const ok = await saveLearningProgress({
        ...progress,
        totalXP,
        level: computeLevelName(totalXP),
        xpPracticeCounts: counts,
      });
      return ok ? gain : 0;
    } catch (_) {
      return 0;
    }
  };

  const saveDialoguePracticeResult = async (
    dialogueId,
    {score = 0, attempts = 0, wrongTurns = []} = {},
  ) => {
    const did = String(dialogueId || '').trim().toLowerCase();
    if (!did) return false;
    try {
      const progress = (await getLearningProgress()) || defaultLearningProgress();
      const stats =
        progress.dialogueStats && typeof progress.dialogueStats === 'object'
          ? {...progress.dialogueStats}
          : {};
      const prev = stats[did] && typeof stats[did] === 'object' ? stats[did] : {};
      const safeAttempts = Math.max(0, Math.floor(Number(attempts) || 0));
      const safeScore = Math.max(0, Math.floor(Number(score) || 0));
      const accuracy =
        safeAttempts > 0
          ? Math.max(0, Math.min(100, Math.round((safeScore / safeAttempts) * 100)))
          : 0;
      stats[did] = {
        ...prev,
        score: safeScore,
        attempts: safeAttempts,
        accuracy,
        wrongTurns: Array.isArray(wrongTurns) ? wrongTurns.slice(0, 12) : [],
        updatedAt: Date.now(),
      };
      return await saveLearningProgress({
        ...progress,
        dialogueStats: stats,
      });
    } catch (_) {
      return false;
    }
  };

  return {
    addVideoWatched,
    setVideoNeedsPractice,
    formatVideoViewCount,
    incrementVideoViewCount,
    completeVideoAndAwardXP,
    awardXPIfFirst,
    awardXPRepeatable,
    saveDialoguePracticeResult,
  };
}

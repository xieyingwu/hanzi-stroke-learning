// ============================================================
//  语音朗读模块 - 基于 Web Speech API (SpeechSynthesis)
// ============================================================

const Voice = (() => {
  const synth = window.speechSynthesis;
  let zhVoice = null;
  let inited  = false;
  let enginePrimed = false;

  // 从可用语音列表中选最优的中文普通话音色
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    zhVoice =
      voices.find(v => v.lang === 'zh-CN' && /普通话|Mandarin|Ting-Ting|Meijia|Lili/.test(v.name)) ||
      voices.find(v => v.lang === 'zh-CN') ||
      voices.find(v => v.lang.startsWith('zh')) ||
      null;
  }

  /** iOS / 部分 WebKit：需在首次触摸时拉取语音列表，后续 speak 才稳定 */
  function primeEngine() {
    if (!synth || enginePrimed) return;
    enginePrimed = true;
    try {
      synth.getVoices();
      pickVoice();
    } catch (e) { /* ignore */ }
  }

  function init() {
    if (!synth || inited) return;
    inited = true;
    pickVoice();
    // 部分浏览器（Chrome）异步加载语音列表
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = function () {
        pickVoice();
      };
    }
    // 首次用户触摸/点击页面时预热（移动端 Safari 常见需求）
    function onFirstInteraction() {
      document.removeEventListener('touchstart', onFirstInteraction, true);
      document.removeEventListener('pointerdown', onFirstInteraction, true);
      primeEngine();
    }
    document.addEventListener('touchstart', onFirstInteraction, { capture: true, passive: true });
    document.addEventListener('pointerdown', onFirstInteraction, { capture: true, passive: true });
  }

  /**
   * 语音就绪情况（供调试或 UI；voices 在部分浏览器中异步出现）
   * @returns {{ supported: boolean, voicesLoaded: boolean, hasZhVoice: boolean, voiceCount: number }}
   */
  function getVoiceStatus() {
    if (!synth) {
      return { supported: false, voicesLoaded: false, hasZhVoice: false, voiceCount: 0 };
    }
    const voices = synth.getVoices();
    pickVoice();
    return {
      supported: true,
      voicesLoaded: voices.length > 0,
      hasZhVoice: !!zhVoice,
      voiceCount: voices.length
    };
  }

  /**
   * 朗读一段文字
   * @param {string} text   - 要朗读的文字
   * @param {number} [rate] - 语速，默认 0.85
   * @param {{ onIssue?: (code: 'no_zh_voice'|'speak_error', ev?: SpeechSynthesisErrorEvent) => void }} [options]
   */
  function speak(text, rate, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const onIssue = typeof opts.onIssue === 'function' ? opts.onIssue : null;

    if (!synth || !text) return;
    // 语音列表在部分浏览器中异步就绪，每次朗读前再选一次音色
    pickVoice();
    const voices = synth.getVoices();
    // 列表已就绪但仍无中文音色时，朗读质量不可预期，提示用户（仍尝试用 lang 朗读）
    if (voices.length > 0 && !zhVoice && onIssue) {
      onIssue('no_zh_voice');
    }
    try {
      if (synth.paused) synth.resume();
    } catch (e) { /* ignore */ }
    synth.cancel();
    primeEngine();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = 'zh-CN';
    utt.rate   = typeof rate === 'number' ? rate : 0.85;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    if (zhVoice) utt.voice = zhVoice;
    utt.onerror = function (ev) {
      console.warn('SpeechSynthesis error:', ev && ev.error ? ev.error : ev);
      if (onIssue) onIssue('speak_error', ev);
    };
    synth.speak(utt);
  }

  /**
   * 朗读单个汉字（稍慢语速，听清楚）
   * @param {string} char
   * @param {{ onIssue?: (code: 'no_zh_voice'|'speak_error', ev?: SpeechSynthesisErrorEvent) => void }} [options]
   */
  function speakChar(char, options) {
    speak(char, 0.8, options);
  }

  /**
   * 朗读拼音（拼音本身含声调字母，直接读文字即可）
   * @param {string} pinyin
   * @param {{ onIssue?: (code: 'no_zh_voice'|'speak_error', ev?: SpeechSynthesisErrorEvent) => void }} [options]
   */
  function speakPinyin(pinyin, options) {
    speak(pinyin, 0.75, options);
  }

  /** 是否支持语音合成 */
  function isSupported() {
    return !!window.speechSynthesis;
  }

  init();

  return { speak, speakChar, speakPinyin, isSupported, getVoiceStatus };
})();

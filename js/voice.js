// ============================================================
//  语音朗读模块 - 基于 Web Speech API (SpeechSynthesis)
// ============================================================

const Voice = (() => {
  const synth = window.speechSynthesis;
  let zhVoice = null;
  let inited  = false;

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

  function init() {
    if (!synth || inited) return;
    inited = true;
    pickVoice();
    // 部分浏览器（Chrome）异步加载语音列表
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = pickVoice;
    }
  }

  /**
   * 朗读一段文字
   * @param {string} text   - 要朗读的文字
   * @param {number} [rate] - 语速，默认 0.85
   */
  function speak(text, rate) {
    if (!synth || !text) return;
    synth.cancel();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = 'zh-CN';
    utt.rate   = typeof rate === 'number' ? rate : 0.85;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    if (zhVoice) utt.voice = zhVoice;
    synth.speak(utt);
  }

  /** 朗读单个汉字（稍慢语速，听清楚） */
  function speakChar(char) {
    speak(char, 0.8);
  }

  /** 朗读拼音（拼音本身含声调字母，直接读文字即可） */
  function speakPinyin(pinyin) {
    speak(pinyin, 0.75);
  }

  /** 是否支持语音合成 */
  function isSupported() {
    return !!window.speechSynthesis;
  }

  init();

  return { speak, speakChar, speakPinyin, isSupported };
})();

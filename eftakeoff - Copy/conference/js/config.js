// Settings you may want to change. No personal data is ever sent anywhere
// unless analyticsEndpoint is filled in AND the parent opts in.

window.PTCC = window.PTCC || {};
window.PTCC.config = {
  siteUrl: 'https://eftakeoffcoachingcg.com/',

  // Anonymous, opt-in usage counts (which checkbox options parents choose —
  // never written notes or dates). Leave empty to switch the feature off
  // completely; the opt-in checkbox only appears when this has a URL.
  // The endpoint receives a JSON POST, e.g. a Google Apps Script web app or Formspree.
  analyticsEndpoint: '',

  // PDF library (html2pdf.js 0.14.0, MIT), bundled locally so it works in mainland China
  // and offline. Loaded only when a parent clicks "Download PDF".
  pdfLibrary: {
    src: 'vendor/html2pdf.bundle.min.js',
  },
};

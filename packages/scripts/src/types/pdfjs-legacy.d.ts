declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  // Minimal "any" shim to satisfy TS in Node scripts.
  // If you want better typing, you can expand these signatures later.
  const pdfjsLib: any;
  export = pdfjsLib;
  export default pdfjsLib;
}
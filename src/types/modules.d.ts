// Minimal typings for the pdfmake 0.3 browser build (the published @types lag the 0.3 API).
declare module 'pdfmake/build/pdfmake' {
  interface CreatedPdf {
    getBlob(): Promise<Blob>;
  }
  const pdfMake: {
    createPdf(definition: unknown): CreatedPdf;
    addVirtualFileSystem(vfs: unknown): void;
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}

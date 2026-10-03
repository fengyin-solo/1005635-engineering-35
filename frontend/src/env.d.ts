/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_APP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// seed-manifest.local.json 是 reset-local 按需生成的可选文件，全新克隆时不存在。
declare module '*/seed-manifest.local.json' {
  const value: import('./data/seed-manifest').SeedManifest
  export default value
}

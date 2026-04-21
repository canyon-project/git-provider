import { defineConfig } from 'tsdown'

export default defineConfig({
  platform: 'node',
  dts: {
    tsgo: true,
  },
  exports: true,
  // ...config options
})

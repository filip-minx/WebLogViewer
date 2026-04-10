import { mkdirSync, writeFileSync } from 'fs'

mkdirSync('dist-electron', { recursive: true })
writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }))
console.log('dist-electron/package.json written')

const fs = require('fs')

const required = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/theme.css',
  'dist/themes/light.css',
  'dist/themes/dark.css',
]

const missing = required.filter((file) => !fs.existsSync(file))
if (missing.length > 0) {
  console.error(`Missing dist files:\n${missing.join('\n')}`)
  process.exit(1)
}

const maps = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(file)
    else if (file.endsWith('.map')) maps.push(file)
  }
}

walk('dist')

if (maps.length > 0) {
  console.error(`Unexpected sourcemaps in dist:\n${maps.join('\n')}`)
  process.exit(1)
}

console.log('dist verified')

import fs from 'node:fs'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

const root = new URL('../templates/noise/', import.meta.url)
const directory = new URL('../templates/noise/', import.meta.url)
const files = fs.readdirSync(directory).filter((name) => name.endsWith('.docx')).sort()
const patterns = [
  /02[./-]10[./-]1985/g,
  /2[./-]10[./-]1985/g,
  /1985[./-]10[./-]02/g
]
for (const filename of files) {
  const bytes = fs.readFileSync(new URL(filename, directory))
  const parts = unzipSync(bytes)
  const hits = []
  for (const [part, content] of Object.entries(parts)) {
    if (!part.startsWith('word/') || !part.endsWith('.xml')) continue
    const xml = strFromU8(content)
    if (patterns.some((pattern) => pattern.test(xml))) hits.push(part)
  }
  console.log(JSON.stringify({ template: filename, has1985DateReference: hits.length > 0, matchingXmlParts: hits.length }))
}

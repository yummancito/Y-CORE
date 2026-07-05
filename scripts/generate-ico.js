const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default

const sizes = [16, 32, 48, 64, 128, 256]

async function generateIco() {
  const svgPath = path.join(__dirname, '..', 'public', 'logo.svg')
  const icoPath = path.join(__dirname, '..', 'public', 'logo.ico')
  const pngs = []

  for (const size of sizes) {
    const png = await sharp(svgPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    pngs.push(png)
  }

  const ico = await pngToIco(pngs)
  fs.writeFileSync(icoPath, ico)
  console.log(`Generated ${icoPath} with sizes: ${sizes.join(', ')}`)
}

generateIco().catch((err) => {
  console.error('Failed to generate ICO:', err)
  process.exit(1)
})

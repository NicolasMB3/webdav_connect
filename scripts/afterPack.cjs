const path = require('path')
const { rcedit } = require('rcedit')

exports.default = async function afterPack(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const icoPath = path.resolve(__dirname, '../build/icon.ico')
  console.log(`[afterPack] Setting icon on ${exePath}`)
  await rcedit(exePath, { icon: icoPath })
}

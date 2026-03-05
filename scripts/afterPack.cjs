const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const { rcedit } = require('rcedit')
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const icoPath = path.resolve(__dirname, '../build/icon.ico')
  console.log(`[afterPack] Setting icon on ${exePath}`)
  await rcedit(exePath, { icon: icoPath })
}

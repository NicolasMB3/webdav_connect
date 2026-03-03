import { execFileSync, execFile } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { isUrlSecurityConfigured, markUrlSecurityConfigured } from './store'

export interface ConnectOptions {
  url: string
  driveLetter: string
  username: string
  password: string
  driveName?: string
  iconPath?: string
}

export interface ConnectDriveOptions {
  skipWebClientCheck?: boolean
}

export interface DriveSpace {
  usedBytes: number
  totalBytes: number
}

function runPowershell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-WindowStyle', 'Hidden', '-NoProfile', '-Command', command],
      {
        encoding: 'utf8',
        windowsHide: true
      },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      }
    )
  })
}

function runNetUse(args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'net',
      ['use', ...args],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: timeoutMs
      },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).killed) {
          reject(new Error('Délai de connexion dépassé (15s). Vérifiez que le serveur est accessible.'))
        } else if (err) reject(new Error(stderr || err.message))
        else resolve(stdout)
      }
    )
  })
}

function runExecFile(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8', windowsHide: true }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

// Convert WebDAV URL to Windows UNC path
// https://server:5006/backup -> \\server@SSL@5006\DavWWWRoot\backup
function urlToUncPath(url: string): string {
  const parsed = new URL(url)
  const host = parsed.hostname
  const port = parsed.port
  const pathPart = parsed.pathname.replace(/\//g, '\\')

  if (parsed.protocol === 'https:') {
    if (!port || port === '443') {
      return `\\\\${host}@SSL\\DavWWWRoot${pathPart}`
    }
    return `\\\\${host}@SSL@${port}\\DavWWWRoot${pathPart}`
  } else {
    if (!port || port === '80') {
      return `\\\\${host}\\DavWWWRoot${pathPart}`
    }
    return `\\\\${host}@${port}\\DavWWWRoot${pathPart}`
  }
}

// Get the UNC hostname that Windows WebClient uses for zone lookups
// https://server:5006/... -> server@SSL@5006
function uncHostname(url: string): string | null {
  const parsed = new URL(url)
  const host = parsed.hostname
  const port = parsed.port
  if (parsed.protocol === 'https:') {
    if (port && port !== '443') return `${host}@SSL@${port}`
    return null
  } else {
    if (port && port !== '80') return `${host}@${port}`
  }
  return null
}

// Split FQDN into domain hierarchy for ZoneMap\Domains
// stockage.cmc-06.fr -> { domain: 'cmc-06.fr', subdomain: 'stockage' }
function splitDomain(hostname: string): { domain: string; subdomain: string } | null {
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    return { domain: parts.slice(1).join('.'), subdomain: parts[0] }
  }
  return null
}

// InternetSetOption commands to notify Explorer to reload Internet Settings
const INTERNET_SET_OPTION_CMD = [
  `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinInet { [DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l); }'`,
  `[WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)`,
  `[WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)`
].join('; ')

async function disableSecurityWarning(url: string): Promise<void> {
  const parsed = new URL(url)
  const hostname = parsed.hostname
  const zoneMap = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\ZoneMap'
  const hkcuZones = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones'
  const domainSplit = splitDomain(hostname)

  // === STRATEGY 1: HKCU settings (no elevation needed) — single batched PowerShell call ===
  const hkcuCmds: string[] = [
    // Zone 3 (Internet) - disable ALL security warnings for file operations
    // 1802=shell execute, 1803=shell file use (drag-drop), 1806=launch, 1807=shell verb, 2200=download
    [
      `Set-ItemProperty -Path '${hkcuZones}\\3' -Name '1802' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\3' -Name '1803' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\3' -Name '1806' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\3' -Name '1807' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\3' -Name '2200' -Value 0`
    ].join('; '),
    // Zone 1 (Intranet)
    [
      `Set-ItemProperty -Path '${hkcuZones}\\1' -Name '1802' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\1' -Name '1803' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\1' -Name '1806' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\1' -Name '1807' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\1' -Name '2200' -Value 0`
    ].join('; '),
    // Zone 2 (Trusted Sites)
    [
      `Set-ItemProperty -Path '${hkcuZones}\\2' -Name '1802' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\2' -Name '1803' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\2' -Name '1806' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\2' -Name '1807' -Value 0`,
      `Set-ItemProperty -Path '${hkcuZones}\\2' -Name '2200' -Value 0`
    ].join('; '),
    // ZoneMap flags
    `Set-ItemProperty -Path '${zoneMap}' -Name 'UncAsIntranet' -Value 1`,
    `Set-ItemProperty -Path '${zoneMap}' -Name 'IntranetName' -Value 1`,
    // ProtocolDefaults: file=1 -> UNC paths default to Intranet instead of Internet
    // This is THE KEY FIX for WebDAV drag-and-drop. Windows resolves V:\ to
    // \\server@SSL@port\... which contains @ in the hostname. ZoneMap\Domains can't
    // match this format, so the default zone for the file: protocol is used.
    `Set-ItemProperty -Path '${zoneMap}\\ProtocolDefaults' -Name 'file' -Value 1`,
    // Domain entry - flat hostname (zone 1 = Intranet)
    `$null = New-Item -Path '${zoneMap}\\Domains\\${hostname}' -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${hostname}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${hostname}' -Name '*' -Value 1 -PropertyType DWord -Force`,
    // Range entry for hostname
    [
      `$null = New-Item -Path '${zoneMap}\\Ranges\\Range100' -Force`,
      `New-ItemProperty -Path '${zoneMap}\\Ranges\\Range100' -Name ':Range' -Value '${hostname}' -PropertyType String -Force`,
      `New-ItemProperty -Path '${zoneMap}\\Ranges\\Range100' -Name 'https' -Value 1 -PropertyType DWord -Force`,
      `New-ItemProperty -Path '${zoneMap}\\Ranges\\Range100' -Name '*' -Value 1 -PropertyType DWord -Force`
    ].join('; '),
    // Office 365/2016+: whitelist host for Basic Auth prompts (fixes "méthode de connexion non sécurisée")
    // + reset BasicAuthSuppressWarning to re-enable prompts if user clicked "Do not show again"
    `$offId = 'HKCU:\\Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Identity'; $null = New-Item -Path $offId -Force; try { $c = (Get-ItemProperty $offId -Name basichostallowlist -EA Stop).basichostallowlist } catch { $c = '' }; if (-not $c -or ($c -split ';') -notcontains '${hostname}') { New-ItemProperty -Path $offId -Name basichostallowlist -Value $(if($c){"$c;${hostname}"}else{'${hostname}'}) -PropertyType ExpandString -Force }; New-ItemProperty -Path $offId -Name 'BasicAuthSuppressWarning' -Value 0 -PropertyType DWord -Force`,
    // Office BasicAuthLevel=2 (covers Office 16.0 and 15.0)
    `$versions = @('16.0','15.0'); foreach($v in $versions) { $p = "HKCU:\\Software\\Microsoft\\Office\\$v\\Common\\Internet"; if (Test-Path "HKCU:\\Software\\Microsoft\\Office\\$v") { $null = New-Item -Path $p -Force; Set-ItemProperty -Path $p -Name 'BasicAuthLevel' -Value 2 } }`
  ]

  // Domain entry - hierarchical (cmc-06.fr\stockage)
  if (domainSplit) {
    hkcuCmds.push(
      `$null = New-Item -Path '${zoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Name '*' -Value 1 -PropertyType DWord -Force`
    )
  }

  // UNC hostname with @SSL@port for WebDAV drag-and-drop zone mapping
  const uncHost = uncHostname(url)
  if (uncHost) {
    hkcuCmds.push(
      `$null = New-Item -Path '${zoneMap}\\Domains\\${uncHost}' -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${uncHost}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${uncHost}' -Name '*' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${zoneMap}\\Domains\\${uncHost}' -Name 'file' -Value 1 -PropertyType DWord -Force`
    )
  }

  // Batch all HKCU commands + InternetSetOption into a single PowerShell process
  try {
    const batch = '$ErrorActionPreference = "Continue"\n' + hkcuCmds.join('\n') + '\n' + INTERNET_SET_OPTION_CMD
    await runPowershell(batch)
  } catch {
    // Batch failed — fallback to individual commands
    for (const cmd of hkcuCmds) {
      try { await runPowershell(cmd) } catch { /* non-critical */ }
    }
    try { await runPowershell(INTERNET_SET_OPTION_CMD) } catch { /* non-critical */ }
  }

  // === STRATEGY 2: HKLM settings (requires single UAC elevation) ===
  try {
    const check = await runPowershell([
      `$z3 = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones\\3'`,
      `$z2 = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones\\2'`,
      `$feat = $false; try { $f = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Internet Explorer\\MAIN\\FeatureControl\\FEATURE_RESPECT_ZONEMAP_FOR_MAPPED_DRIVES_KB929798' -ErrorAction Stop; $feat = ($f.'explorer.exe' -eq 1) } catch {}`,
      `$saveZone = $false; try { $a = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Attachments' -ErrorAction Stop; $saveZone = ($a.SaveZoneInformation -eq 1) -and ($a.ScanWithAntiVirus -eq 1) } catch {}`,
      `$lowRisk = $false; try { $r = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Associations' -ErrorAction Stop; $lowRisk = ($r.LowRiskFileTypes -ne $null) } catch {}`,
      ...(uncHost ? [`$uncDom = Test-Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\ZoneMap\\Domains\\${uncHost}'`] : [`$uncDom = $true`]),
      `$wcAuth = $false; try { $wc = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters'; $wcAuth = ($wc.BasicAuthLevel -eq 2) } catch {}`,
      `$wcFwd = $false; try { $wc = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters'; $fwd = $wc.AuthForwardServerList; if ($fwd -contains 'https://*.${domainSplit ? domainSplit.domain : hostname}') { $wcFwd = $true } } catch {}`,
      `Write-Output "$($z3.'1806')|$($z3.'1802')|$($z3.'1803')|$($z3.'2200')|$($z2.'1806')|$feat|$saveZone|$lowRisk|$uncDom|$wcAuth|$wcFwd"`
    ].join('; '))

    const parts = check.trim().split('|')
    const needsElevation =
      parts[0] !== '0' || parts[1] !== '0' || parts[2] !== '0' || parts[3] !== '0' ||
      parts[4] !== '0' ||
      parts[5] !== 'True' || parts[6] !== 'True' || parts[7] !== 'True' || parts[8] !== 'True' ||
      parts[9] !== 'True' || parts[10] !== 'True'

    if (needsElevation) {
      const hklmZones = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones'
      const hklmZoneMap = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\ZoneMap'
      const featurePath = 'HKLM:\\SOFTWARE\\Microsoft\\Internet Explorer\\MAIN\\FeatureControl\\FEATURE_RESPECT_ZONEMAP_FOR_MAPPED_DRIVES_KB929798'
      const hklmPoliciesAtt = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Attachments'
      const hklmPoliciesAssoc = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Associations'
      const hklmIESecurity = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Security'

      const lowRiskTypes = '.zip;.rar;.7z;.tar;.gz;.pdf;.doc;.docx;.xls;.xlsx;.ppt;.pptx;.txt;.csv;.jpg;.jpeg;.png;.gif;.bmp;.svg;.mp3;.mp4;.avi;.mkv;.mov;.wav;.flac;.exe;.msi;.bat;.cmd;.ps1;.sh;.py;.js;.ts;.html;.css;.json;.xml;.yaml;.yml;.md;.log;.cfg;.ini;.iso;.img;.vhd;.vmdk'

      const scriptLines = [
        // Zone 3 (Internet) - ALL actions = allow
        `Set-ItemProperty -Path '${hklmZones}\\3' -Name '1802' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\3' -Name '1803' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\3' -Name '1806' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\3' -Name '1807' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\3' -Name '2200' -Value 0`,
        // Zone 2 (Trusted)
        `Set-ItemProperty -Path '${hklmZones}\\2' -Name '1802' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\2' -Name '1803' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\2' -Name '1806' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\2' -Name '1807' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\2' -Name '2200' -Value 0`,
        // Zone 1 (Intranet)
        `Set-ItemProperty -Path '${hklmZones}\\1' -Name '1802' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\1' -Name '1803' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\1' -Name '1806' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\1' -Name '1807' -Value 0`,
        `Set-ItemProperty -Path '${hklmZones}\\1' -Name '2200' -Value 0`,
        // FEATURE_RESPECT_ZONEMAP_FOR_MAPPED_DRIVES
        `$null = New-Item -Path '${featurePath}' -Force`,
        `New-ItemProperty -Path '${featurePath}' -Name '*' -Value 1 -PropertyType DWord -Force`,
        `New-ItemProperty -Path '${featurePath}' -Name 'explorer.exe' -Value 1 -PropertyType DWord -Force`,
        // HKLM Domain entries
        domainSplit
          ? `$null = New-Item -Path '${hklmZoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${domainSplit.domain}\\${domainSplit.subdomain}' -Name '*' -Value 1 -PropertyType DWord -Force`
          : `$null = New-Item -Path '${hklmZoneMap}\\Domains\\${hostname}' -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${hostname}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${hostname}' -Name '*' -Value 1 -PropertyType DWord -Force`,
        `$null = New-Item -Path '${hklmZoneMap}\\Domains\\${hostname}' -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${hostname}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${hostname}' -Name '*' -Value 1 -PropertyType DWord -Force`,
        // UNC hostname with @SSL@port
        ...(uncHost ? [
          `$null = New-Item -Path '${hklmZoneMap}\\Domains\\${uncHost}' -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${uncHost}' -Name 'https' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${uncHost}' -Name '*' -Value 1 -PropertyType DWord -Force; New-ItemProperty -Path '${hklmZoneMap}\\Domains\\${uncHost}' -Name 'file' -Value 1 -PropertyType DWord -Force`
        ] : []),
        // SaveZoneInformation + ScanWithAntiVirus
        `$null = New-Item -Path '${hklmPoliciesAtt}' -Force`,
        `New-ItemProperty -Path '${hklmPoliciesAtt}' -Name 'SaveZoneInformation' -Value 1 -PropertyType DWord -Force`,
        `New-ItemProperty -Path '${hklmPoliciesAtt}' -Name 'ScanWithAntiVirus' -Value 1 -PropertyType DWord -Force`,
        `New-ItemProperty -Path '${hklmPoliciesAtt}' -Name 'HideZoneInfoOnProperties' -Value 1 -PropertyType DWord -Force`,
        // LowRiskFileTypes
        `$null = New-Item -Path '${hklmPoliciesAssoc}' -Force`,
        `New-ItemProperty -Path '${hklmPoliciesAssoc}' -Name 'LowRiskFileTypes' -Value '${lowRiskTypes}' -PropertyType String -Force`,
        // DisableSecuritySettingsCheck
        `$null = New-Item -Path '${hklmIESecurity}' -Force`,
        `New-ItemProperty -Path '${hklmIESecurity}' -Name 'DisableSecuritySettingsCheck' -Value 1 -PropertyType DWord -Force`,
        // WebClient: BasicAuthLevel=2, AuthForwardServerList, FileSizeLimitInBytes (fixes Office WebDAV)
        `Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters' -Name 'BasicAuthLevel' -Value 2`,
        `Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters' -Name 'FileSizeLimitInBytes' -Value 4294967295`,
        `$wcp = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters'; try { $fwd = @((Get-ItemProperty -Path $wcp -Name AuthForwardServerList -EA Stop).AuthForwardServerList) } catch { $fwd = @() }; $entry = 'https://*.${domainSplit ? domainSplit.domain : hostname}'; if ($fwd -notcontains $entry) { $fwd = @($fwd | Where-Object { $_ }) + $entry; Set-ItemProperty -Path $wcp -Name AuthForwardServerList -Value ([string[]]$fwd) }`,
        // Restart WebClient to apply new parameters
        `Restart-Service WebClient -Force`,
        // Notify Explorer to reload Internet Settings after HKLM changes
        `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinInet { [DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l); }'`,
        `[WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)`,
        `[WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)`
      ]

      const scriptPath = join(app.getPath('userData'), 'fix-security.ps1')
      writeFileSync(scriptPath, scriptLines.join('\n'), 'utf8')

      try {
        execFileSync(
          'powershell.exe',
          [
            '-WindowStyle', 'Hidden', '-NoProfile', '-Command',
            `Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"' -Verb RunAs -Wait`
          ],
          { encoding: 'utf8', windowsHide: true }
        )
      } catch {
        // User declined UAC or script failed
      }
    }
  } catch {
    // HKLM strategy failed
  }
}

export async function ensureWebClient(): Promise<void> {
  // Use sc query (~50ms) instead of PowerShell Get-Service (~600ms)
  try {
    const result = await runExecFile('sc', ['query', 'WebClient'])
    if (result.includes('RUNNING')) return

    // Service not running, try sc start (no elevation needed if user has rights)
    try {
      await runExecFile('sc', ['start', 'WebClient'])
      return
    } catch {
      // sc start requires elevation, fall through
    }
  } catch {
    // sc query failed, fall through
  }

  // Fallback: elevate via PowerShell UAC prompt
  try {
    execFileSync(
      'powershell.exe',
      [
        '-WindowStyle', 'Hidden', '-NoProfile', '-Command',
        'Start-Process powershell -ArgumentList "-Command Start-Service WebClient" -Verb RunAs -Wait'
      ],
      { encoding: 'utf8', windowsHide: true }
    )
  } catch {
    // User declined UAC, let net use fail with clear error
  }
}

export async function connectDrive(opts: ConnectOptions, driveOpts?: ConnectDriveOptions): Promise<void> {
  if (!driveOpts?.skipWebClientCheck) {
    await ensureWebClient()
  }

  // Skip security config if already applied for this URL (persistent registry settings)
  if (!isUrlSecurityConfigured(opts.url)) {
    await disableSecurityWarning(opts.url)
    markUrlSecurityConfigured(opts.url)
  }

  // Disconnect only the target drive letter (NOT the UNC path, as other drives may share it)
  try {
    await runNetUse([opts.driveLetter, '/delete', '/yes'])
  } catch {
    // Expected if not currently mapped
  }

  // Connect
  const uncPath = urlToUncPath(opts.url)
  try {
    await runNetUse([
      opts.driveLetter,
      opts.url,
      `/user:${opts.username}`,
      opts.password,
      '/persistent:yes'
    ])
  } catch (err) {
    if (err instanceof Error && err.message.includes('1219')) {
      // Error 1219: another drive already has a session to this server.
      // Reuse the existing session by mapping with UNC path (no credentials).
      await runNetUse([opts.driveLetter, uncPath, '/persistent:yes'])
    } else {
      throw err
    }
  }

  // Rename in Explorer via MountPoints2 _LabelFromReg
  const name = opts.driveName || 'NAS CMC-06'
  try {
    await setDriveLabel(opts.driveLetter, name)
  } catch {
    // Non-critical
  }

  // Set custom drive icon in Explorer
  if (opts.iconPath) {
    try {
      const letter = opts.driveLetter.replace(':', '')
      const regPath = `HKCU:\\Software\\Classes\\Applications\\Explorer.exe\\Drives\\${letter}\\DefaultIcon`
      const icoPath = opts.iconPath.replace(/\\/g, '\\\\')
      await runPowershell(
        `New-Item -Path '${regPath}' -Force | Set-ItemProperty -Name '(Default)' -Value '${icoPath}'`
      )
    } catch {
      // Non-critical
    }
  }
}

export async function disconnectDrive(driveLetter: string): Promise<void> {
  try {
    await runNetUse([driveLetter, '/delete', '/yes'])
  } catch (err) {
    // Error 2250 = "connection not found" - drive already disconnected
    if (err instanceof Error && err.message.includes('2250')) return
    throw err
  }
}

export async function getDriveSpace(driveLetter: string): Promise<DriveSpace | null> {
  try {
    const letter = driveLetter.replace(':', '')
    const result = await runPowershell(
      `Get-PSDrive ${letter} | Select-Object Used,Free | ConvertTo-Json`
    )
    const data = JSON.parse(result.trim())
    if (data.Used != null && data.Free != null) {
      return { usedBytes: data.Used, totalBytes: data.Used + data.Free }
    }
    return null
  } catch {
    return null
  }
}

export function isDriveConnected(driveLetter: string): boolean {
  try {
    const result = execFileSync('net', ['use', driveLetter], {
      encoding: 'utf8',
      windowsHide: true
    })
    return result.includes('OK') || result.includes('Status')
  } catch {
    return false
  }
}

export function isDriveConnectedAsync(driveLetter: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('net', ['use', driveLetter], { encoding: 'utf8', windowsHide: true }, (err, stdout) => {
      if (err) resolve(false)
      else resolve(stdout.includes('OK') || stdout.includes('Status'))
    })
  })
}

async function getRemotePath(driveLetter: string): Promise<string | null> {
  try {
    const output = await runNetUse([driveLetter])
    const match = output.match(/Remote name\s+(.+)/i) || output.match(/Nom distant\s+(.+)/i)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

async function setDriveLabel(driveLetter: string, name: string): Promise<void> {
  const remotePath = await getRemotePath(driveLetter)
  if (!remotePath) return

  const mountKey = remotePath.replace(/\\/g, '#')
  const regPath = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\${mountKey}`
  await runPowershell(
    `New-ItemProperty -Path '${regPath}' -Name '_LabelFromReg' -Value '${name.replace(/'/g, "''")}' -Force`
  )
}

export async function renameDrive(driveLetter: string, name: string): Promise<void> {
  await setDriveLabel(driveLetter, name)
}

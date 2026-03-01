import { execFileSync, execFile } from 'child_process'

export interface ConnectOptions {
  url: string
  driveLetter: string
  username: string
  password: string
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

function runNetUse(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'net',
      ['use', ...args],
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

export async function ensureWebClient(): Promise<void> {
  try {
    const result = await runPowershell('(Get-Service WebClient).Status')
    if (result.trim() !== 'Running') {
      await runPowershell('Start-Service WebClient')
    }
  } catch {
    try {
      execFileSync(
        'powershell.exe',
        [
          '-WindowStyle',
          'Hidden',
          '-NoProfile',
          '-Command',
          'Start-Process powershell -ArgumentList "-Command Start-Service WebClient" -Verb RunAs -Wait'
        ],
        { encoding: 'utf8', windowsHide: true }
      )
    } catch {
      // If user declines UAC, continue and let net use fail with clear error
    }
  }
}

export async function connectDrive(opts: ConnectOptions): Promise<void> {
  await ensureWebClient()

  // Disconnect first if already mapped
  try {
    await runNetUse([opts.driveLetter, '/delete', '/yes'])
  } catch {
    // Not mapped, ignore
  }

  await runNetUse([
    opts.driveLetter,
    opts.url,
    `/user:${opts.username}`,
    opts.password,
    '/persistent:yes'
  ])

  // Rename in Explorer
  try {
    await runPowershell(
      `$s = New-Object -ComObject Shell.Application; $s.NameSpace('${opts.driveLetter}\\').Self.Name = 'NAS CMC-06'`
    )
  } catch {
    // Non-critical
  }
}

export async function disconnectDrive(driveLetter: string): Promise<void> {
  await runNetUse([driveLetter, '/delete', '/yes'])
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

export function openExplorer(driveLetter: string): void {
  execFile('explorer.exe', [`${driveLetter}\\`], { windowsHide: true })
}

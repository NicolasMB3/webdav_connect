export interface ServerConfig {
  id: string
  url: string
  driveLetter: string
  username: string
  password: string
  autoConnect: boolean
  driveName: string
}

export interface ConnectOptions {
  url: string
  driveLetter: string
  username: string
  password: string
  driveName?: string
}

export interface DriveSpace {
  usedBytes: number
  totalBytes: number
}

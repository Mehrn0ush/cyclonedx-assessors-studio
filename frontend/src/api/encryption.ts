import client from './client'

export interface KeyVersion {
  version: number
  isActive: boolean
  createdAt: string
  retiredAt: string | null
}

export interface EncryptionStatus {
  available: boolean
  passthroughMode: boolean
  activeKeyVersion: number | null
  keyVersions: KeyVersion[]
  encryptedFields: {
    webhook: {
      total: number
      encrypted: number
      plaintext: number
    }
  }
}

export interface RotateResult {
  message: string
  previousVersion: number | null
  newVersion: number
  processed: number
  rekeyed: number
}

export async function getEncryptionStatus(): Promise<EncryptionStatus> {
  const { data } = await client.get('/admin/encryption/status')
  return data
}

export async function rotateEncryptionKey(): Promise<RotateResult> {
  const { data } = await client.post('/admin/encryption/rotate')
  return data
}

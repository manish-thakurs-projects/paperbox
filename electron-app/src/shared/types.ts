export type PairedDevice = {
  id: string;
  name?: string;
  publicKeyPem?: string;
  pairedAt?: string;
};

export type UploadRecord = {
  uploadId: string;
  timestamp: string;
  fileHash: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  senderDeviceId: string;
  retries: number;
};

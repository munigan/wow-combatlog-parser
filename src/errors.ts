export class FileTooLargeError extends Error {
  bytesRead: number;
  maxBytes: number;

  constructor(bytesRead: number, maxBytes: number) {
    super(
      `File exceeds maximum size: ${(bytesRead / (1024 * 1024)).toFixed(1)} MB read, limit is ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
    );
    this.name = "FileTooLargeError";
    this.bytesRead = bytesRead;
    this.maxBytes = maxBytes;
  }
}

export const DEFAULT_MAX_BYTES = 1_073_741_824; // 1 GB

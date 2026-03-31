import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER = 'ontrac/driver-photos';

/**
 * Upload a driver selfie to Cloudinary.
 * Uses the driver number as the stable public_id so re-uploads overwrite cleanly.
 *
 * @param {Buffer} fileBuffer  - Raw image file buffer
 * @param {string} mimeType    - e.g. 'image/jpeg'
 * @param {string} driverNumber - e.g. 'D12345'
 * @returns {{ url: string, publicId: string }}
 */
export async function uploadDriverPhoto(fileBuffer, mimeType, driverNumber) {
  const safeNumber = driverNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId = `${FOLDER}/${safeNumber}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: true,
        folder: undefined, // public_id already includes folder path
        resource_type: 'image',
        format: 'jpg', // normalise all uploads to JPEG
        transformation: [
          { width: 480, height: 480, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete a driver's photo from Cloudinary.
 * Resolves silently if the asset does not exist.
 *
 * @param {string} driverNumber
 */
export async function deleteDriverPhoto(driverNumber) {
  const safeNumber = driverNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const publicId = `${FOLDER}/${safeNumber}`;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch {
    // Non-fatal — log and continue
    console.warn(`[Cloudinary] Could not delete photo for driver ${driverNumber}`);
  }
}

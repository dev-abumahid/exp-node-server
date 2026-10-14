import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { configs } from '../configs/index.js';
import { AppError } from './app_error.js';

const { cloud_name, cloud_api_key, cloud_api_secret } = configs.cloudinary;
const isConfigured = Boolean(cloud_name && cloud_api_key && cloud_api_secret);

cloudinary.config({
  cloud_name,
  api_key: cloud_api_key,
  api_secret: cloud_api_secret,
});

/**
 * Streams an in-memory image to Cloudinary. `resource_type: 'image'` makes
 * Cloudinary reject anything that isn't really an image, whatever its mimetype said.
 */
const uploadCloud = (file: Express.Multer.File, folder = 'uploads'): Promise<UploadApiResponse> => {
  if (!isConfigured) {
    return Promise.reject(new AppError('Image upload is not configured', 503));
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: 'image', folder }, (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve(result);
      })
      .end(file.buffer);
  });
};

export default uploadCloud;

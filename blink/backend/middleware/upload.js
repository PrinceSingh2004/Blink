const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Fast buffered memory storage prevents typical Cloudinary v4 File System node limits
const storage = multer.memoryStorage();
const upload = multer({ 
    storage, 
    limits: { fileSize: 200 * 1024 * 1024 } // Allow heavy videos (200mb)
});

const clUpload = (buffer, folder, resourceType = 'auto') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: resourceType },
            (error, result) => {
                if (result) resolve(result);
                else reject(error);
            }
        );
        stream.end(buffer);
    });
};

module.exports = { upload, clUpload };

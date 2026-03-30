// Cloudinary SDK automatically picks up CLOUDINARY_URL from .env
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');

// Using memory storage for high-performance streaming
const storage = multer.memoryStorage();
const upload = multer({ 
    storage, 
    limits: { fileSize: 200 * 1024 * 1024 } // Allow high-quality videos (200mb)
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

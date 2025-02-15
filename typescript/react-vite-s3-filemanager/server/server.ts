import express, { Request, Response } from 'express';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// AWS S3 Configuration
const s3 = new AWS.S3({
  region: process.env.AWS_REGION as string,
  credentials: new AWS.Credentials(
    process.env.AWS_ACCESS_KEY as string,
    process.env.AWS_SECRET_KEY as string
  ),
});

const BUCKET_NAME = process.env.S3_BUCKET as string;

interface S3File {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
}

/** Get list of files in S3 */
app.get('/api/files', async (req: Request, res: Response<S3File[] | { error: string }>) => {
  try {
    const { Contents } = await s3.listObjectsV2({ Bucket: BUCKET_NAME }).promise();
    
    if (!Contents) return res.status(404).json({ error: 'No files found' });

    const files: S3File[] = Contents.map(file => ({
      key: file.Key || '',
      name: file.Key || '',
      size: file.Size || 0,
      lastModified: file.LastModified || new Date(),
    }));

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** Generate presigned URL for uploading */
app.get('/api/upload', async (req: Request, res: Response<{ uploadUrl?: string; error?: string }>) => {
  try {
    const { filename } = req.query;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const params: AWS.S3.PutObjectRequest = {
      Bucket: BUCKET_NAME,
      Key: filename,
      Expires: 60, // URL expires in 60 seconds
      ContentType: 'application/octet-stream',
    };
    
    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
    res.json({ uploadUrl });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** Generate presigned URL for downloading */
app.get('/api/download', async (req: Request, res: Response<{ downloadUrl?: string; error?: string }>) => {
  try {
    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'File key is required' });
    }

    const params: AWS.S3.GetObjectRequest = {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: 60,
    };

    const downloadUrl = await s3.getSignedUrlPromise('getObject', params);
    res.json({ downloadUrl });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/** Delete a file from S3 */
app.delete('/api/delete', async (req: Request, res: Response<{ message?: string; error?: string }>) => {
  try {
    const { key } = req.body;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'File key is required' });
    }

    await s3.deleteObject({ Bucket: BUCKET_NAME, Key: key }).promise();
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

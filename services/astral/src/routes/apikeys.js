import express from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/encryption.js';
import { authenticateRequest } from '../middleware/authenticateRequest.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all API keys (admin only) - returns keys without decrypted values
router.get('/', authenticateRequest, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        service: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(apiKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create new API key (admin only)
router.post('/', authenticateRequest, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { name, service, key, value, expiresAt } = req.body;
    
    if (!name || !service || !key) {
      return res.status(400).json({ error: 'Name, service, and key are required' });
    }

    // Encrypt the API key and optional value
    const encryptedKey = encrypt(key);
    const encryptedValue = value ? encrypt(value) : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        service,
        encryptedKey,
        encryptedValue,
        createdById: req.tokenPayload.userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      },
      select: {
        id: true,
        name: true,
        service: true,
        createdAt: true,
        expiresAt: true
      }
    });

    res.status(201).json(apiKey);
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update API key (admin only)
router.put('/:id', authenticateRequest, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, key, value, expiresAt, isActive } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (key !== undefined) updateData.encryptedKey = encrypt(key);
    if (value !== undefined) updateData.encryptedValue = value ? encrypt(value) : null;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        service: true,
        updatedAt: true,
        expiresAt: true,
        isActive: true
      }
    });

    res.json(apiKey);
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Delete API key (admin only)
router.delete('/:id', authenticateRequest, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.apiKey.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Internal endpoint for services to get decrypted API keys
// This should be called only from backend services, never exposed to frontend
router.post('/retrieve', async (req, res) => {
  try {
    const { service, requestingService } = req.body;
    
    // Define which services can access which API keys
    const serviceAccessMap = {
      satellite: ['microsoft', 'github', 'openai', 'shodan', 'virustotal', 'custom'],
      horizon: ['docusign', 'adobe'],
      // Add more service mappings as needed
    };

    // Check if requesting service has access to the requested API key service
    const allowedServices = serviceAccessMap[requestingService] || [];
    if (!allowedServices.includes(service)) {
      return res.status(403).json({ error: 'Service not authorized for this API key' });
    }

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        service,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'No active API key found for service' });
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    // Decrypt and return the key
    const decryptedKey = decrypt(apiKey.encryptedKey);
    const decryptedValue = apiKey.encryptedValue ? decrypt(apiKey.encryptedValue) : null;

    res.json({
      service: apiKey.service,
      key: decryptedKey,
      value: decryptedValue
    });
  } catch (error) {
    console.error('Error retrieving API key:', error);
    res.status(500).json({ error: 'Failed to retrieve API key' });
  }
});

export default router;
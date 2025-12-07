const loginSchema = {
    tags: ['Token'],
    summary: 'Login to get initial tokens',
    body: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        deviceId: { type: 'string' }
      }
    }
  };
  
  const refreshSchema = {
    tags: ['Token'],
    summary: 'Rotate Refresh Token',
    body: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } }
    }
  };
  
  const revokeSchema = {
    tags: ['Token'],
    summary: 'Revoke Refresh Token',
    body: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } }
    }
  };
  
  module.exports = { loginSchema, refreshSchema, revokeSchema };
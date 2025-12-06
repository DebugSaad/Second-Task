# Auth API Documentation

This API provides endpoints for token-based authentication, including login, token rotation (refresh), and token revocation.

## Base URL
`http://localhost:3000`

## Endpoints

### 1. Login
**Endpoint:** `/login`
**Method:** `POST`
**Description:** Generates initial access and refresh tokens for a user and device.

#### Request Body (JSON)
```json
{
  "userId": "user_123",   
  "deviceId": "device_01" 
}
```

#### Response Body (JSON)
**Success (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

---

### 2. Refresh Token
**Endpoint:** `/token/refresh`
**Method:** `POST`
**Description:** Rotates the refresh token. Validates the provided refresh token against the stored hash in Redis. If valid, issues a new pair of access and refresh tokens and invalidates the old one. Detects token reuse.

#### Request Body (JSON)
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..." // Required
}
```

#### Response Body (JSON)
**Success (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

**Error (403 Forbidden - Invalid/Expired):**
```json
{
  "error": "Refresh token invalid or expired"
}
```

**Error (403 Forbidden - Reuse Detected):**
```json
{
  "error": "Token reuse detected"
}
```

**Error (401 Unauthorized - Expired):**
```json
{
  "error": "Refresh token expired",
  "code": "TOKEN_EXPIRED"
}
```

---

### 3. Revoke Token
**Endpoint:** `/token/revoke`
**Method:** `POST`
**Description:** Revokes a refresh token, removing it from the Redis store and logging the action in the database.

#### Request Body (JSON)
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..." // Required
}
```

#### Response Body (JSON)
**Success (200 OK):**
```json
{
  "message": "Token revoked successfully"
}
```

**Error (400 Bad Request - Malformed):**
```json
{
  "error": "Malformed token"
}
```

**Error (500 Internal Server Error):**
```json
{
  "error": "Revocation failed",
  "details": "Error message details..."
}
```

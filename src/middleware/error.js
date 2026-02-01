/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  console.error('全局错误处理:', err);
  
  // 默认错误响应
  const errorResponse = {
    success: false,
    code: 500,
    message: 'Internal server error',
    error: {
      type: 'INTERNAL_ERROR',
      details: 'An unexpected error occurred'
    },
    requestId: req.id || 'unknown'
  };
  
  // 处理特定错误类型
  if (err.name === 'ValidationError') {
    errorResponse.code = 400;
    errorResponse.message = 'Validation error';
    errorResponse.error = {
      type: 'VALIDATION_ERROR',
      details: err.message
    };
  } else if (err.name === 'CastError') {
    errorResponse.code = 400;
    errorResponse.message = 'Invalid data format';
    errorResponse.error = {
      type: 'CAST_ERROR',
      details: 'Invalid data type or format'
    };
  } else if (err.code === 'ECONNREFUSED') {
    errorResponse.code = 503;
    errorResponse.message = 'Service unavailable';
    errorResponse.error = {
      type: 'SERVICE_UNAVAILABLE',
      details: 'Unable to connect to backend service'
    };
  } else if (err.code === 'ENOTFOUND') {
    errorResponse.code = 503;
    errorResponse.message = 'Service not found';
    errorResponse.error = {
      type: 'SERVICE_NOT_FOUND',
      details: 'Backend service is not available'
    };
  } else if (err.response && err.response.status) {
    // 代理服务返回的错误
    errorResponse.code = err.response.status;
    errorResponse.message = err.response.data?.message || 'Service error';
    errorResponse.error = {
      type: 'SERVICE_ERROR',
      details: err.response.data?.error?.details || 'Backend service error'
    };
  }
  
  // 开发环境显示详细错误信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.originalError = {
      message: err.message,
      name: err.name,
      code: err.code
    };
  }
  
  res.status(errorResponse.code).json(errorResponse);
};

/**
 * 404错误处理
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    code: 404,
    message: 'Resource not found',
    error: {
      type: 'NOT_FOUND',
      details: `The requested resource ${req.originalUrl} was not found on this server`
    },
    requestId: req.id || 'unknown'
  });
};

/**
 * 异步错误包装器
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 请求验证中间件
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Validation error',
        error: {
          type: 'VALIDATION_ERROR',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        },
        requestId: req.id
      });
    }
    
    req.body = value;
    next();
  };
};

/**
 * 超时中间件
 */
const timeoutHandler = (timeout = 30000) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          code: 504,
          message: 'Request timeout',
          error: {
            type: 'REQUEST_TIMEOUT',
            details: `Request took longer than ${timeout}ms to process`
          },
          requestId: req.id
        });
      }
    }, timeout);
    
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
};

/**
 * 请求大小限制中间件
 */
const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB
      return res.status(413).json({
        success: false,
        code: 413,
        message: 'Request entity too large',
        error: {
          type: 'REQUEST_TOO_LARGE',
          details: `Request body exceeds the maximum allowed size of ${maxSize}`
        },
        requestId: req.id
      });
    }
    
    next();
  };
};

/**
 * 服务健康检查中间件
 */
const healthCheck = async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        redis: 'unknown',
        database: 'unknown'
      }
    };
    
    // 检查Redis连接
    try {
      const Redis = require('redis');
      const redisClient = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      await redisClient.connect();
      await redisClient.ping();
      await redisClient.disconnect();
      
      health.services.redis = 'healthy';
    } catch (error) {
      health.services.redis = 'unhealthy';
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      code: statusCode,
      message: 'Health check completed',
      data: health,
      requestId: req.id
    });
    
  } catch (error) {
    console.error('健康检查错误:', error);
    
    res.status(503).json({
      success: false,
      code: 503,
      message: 'Health check failed',
      error: {
        type: 'HEALTH_CHECK_ERROR',
        details: 'Unable to complete health check'
      },
      requestId: req.id
    });
  }
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequest,
  timeoutHandler,
  requestSizeLimit,
  healthCheck
};
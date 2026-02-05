/**
 * 负载均衡调度器
 * 支持多种负载均衡策略
 */

const { getWorkersByService, updateWorkerConnections, updateWorkerStats } = require('../db/sqlite');

class LoadBalancer {
  constructor(strategy = 'weighted-round-robin') {
    this.strategy = strategy;
    this.roundRobinIndex = new Map(); // 轮询索引
    this.currentWeights = new Map();  // 加权轮询权重
    this.circuitBreaker = new Map();  // 熔断器
  }

  /**
   * 选择最优工作节点
   */
  selectWorker(serviceType) {
    const workers = getWorkersByService(serviceType);
    
    if (!workers || workers.length === 0) {
      return null;
    }

    // 过滤掉熔断的节点
    const availableWorkers = workers.filter(w => !this.isCircuitOpen(w.id));
    
    if (availableWorkers.length === 0) {
      // 如果所有节点都熔断了，尝试重置最老的熔断
      this.resetOldestCircuit();
      return this.selectWorker(serviceType);
    }

    let selectedWorker;
    
    switch (this.strategy) {
      case 'round-robin':
        selectedWorker = this.roundRobin(availableWorkers, serviceType);
        break;
      case 'least-connections':
        selectedWorker = this.leastConnections(availableWorkers);
        break;
      case 'weighted-round-robin':
        selectedWorker = this.weightedRoundRobin(availableWorkers, serviceType);
        break;
      case 'response-time':
        selectedWorker = this.responseTime(availableWorkers);
        break;
      default:
        selectedWorker = this.weightedRoundRobin(availableWorkers, serviceType);
    }

    return selectedWorker;
  }

  /**
   * 轮询算法
   */
  roundRobin(workers, serviceType) {
    const key = `rr-${serviceType}`;
    const currentIndex = this.roundRobinIndex.get(key) || 0;
    const worker = workers[currentIndex % workers.length];
    this.roundRobinIndex.set(key, currentIndex + 1);
    return worker;
  }

  /**
   * 最少连接算法
   */
  leastConnections(workers) {
    return workers.reduce((min, worker) => 
      worker.current_connections < min.current_connections ? worker : min
    );
  }

  /**
   * 加权轮询算法 (平滑加权轮询)
   */
  weightedRoundRobin(workers, serviceType) {
    const key = `wrr-${serviceType}`;
    
    let totalWeight = 0;
    let maxWeight = -Infinity;
    let selectedWorker = null;
    
    for (const worker of workers) {
      // 获取当前权重，如果不存在则初始化为0
      const currentWeight = (this.currentWeights.get(`${key}-${worker.id}`) || 0) + worker.weight;
      this.currentWeights.set(`${key}-${worker.id}`, currentWeight);
      
      totalWeight += worker.weight;
      
      if (currentWeight > maxWeight) {
        maxWeight = currentWeight;
        selectedWorker = worker;
      }
    }
    
    if (selectedWorker) {
      // 减去总权重
      const newWeight = this.currentWeights.get(`${key}-${selectedWorker.id}`) - totalWeight;
      this.currentWeights.set(`${key}-${selectedWorker.id}`, newWeight);
    }
    
    return selectedWorker;
  }

  /**
   * 响应时间算法
   */
  responseTime(workers) {
    // 选择平均响应时间最短的节点
    return workers.reduce((fastest, worker) => {
      const fastestTime = fastest.avg_response_time || Infinity;
      const workerTime = worker.avg_response_time || Infinity;
      return workerTime < fastestTime ? worker : fastest;
    });
  }

  /**
   * 熔断器：记录失败
   */
  recordFailure(workerId) {
    const failure = this.circuitBreaker.get(workerId) || { 
      count: 0, 
      timestamp: Date.now() 
    };
    
    failure.count++;
    failure.timestamp = Date.now();
    this.circuitBreaker.set(workerId, failure);
    
    console.log(`[熔断器] Worker ${workerId} 失败次数: ${failure.count}`);
  }

  /**
   * 熔断器：记录成功
   */
  recordSuccess(workerId) {
    // 成功后重置失败计数
    this.circuitBreaker.delete(workerId);
  }

  /**
   * 熔断器：检查是否打开
   */
  isCircuitOpen(workerId, threshold = 5, timeout = 60000) {
    const failure = this.circuitBreaker.get(workerId);
    if (!failure) return false;
    
    // 如果失败次数超过阈值
    if (failure.count >= threshold) {
      // 检查是否超过超时时间
      if (Date.now() - failure.timestamp < timeout) {
        return true; // 熔断打开
      } else {
        // 超时后重置
        this.circuitBreaker.delete(workerId);
        return false;
      }
    }
    
    return false;
  }

  /**
   * 重置最老的熔断
   */
  resetOldestCircuit() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, value] of this.circuitBreaker.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      console.log(`[熔断器] 重置最老的熔断节点: ${oldestKey}`);
      this.circuitBreaker.delete(oldestKey);
    }
  }

  /**
   * 获取策略名称
   */
  getStrategy() {
    return this.strategy;
  }

  /**
   * 设置策略
   */
  setStrategy(strategy) {
    this.strategy = strategy;
    console.log(`[负载均衡] 切换策略为: ${strategy}`);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      strategy: this.strategy,
      circuitBreakers: Array.from(this.circuitBreaker.entries()).map(([id, data]) => ({
        workerId: id,
        failures: data.count,
        timestamp: data.timestamp
      }))
    };
  }
}

// 单例模式
let instance = null;

function getLoadBalancer(strategy) {
  if (!instance) {
    instance = new LoadBalancer(strategy);
  }
  return instance;
}

module.exports = {
  LoadBalancer,
  getLoadBalancer
};

/**
 * 企业微信 API 代理服务器
 * 用于解决浏览器 CORS 限制问题
 */

const http = require('http');
const https = require('https');

const PROXY_PORT = 3001;

// 创建代理服务器
const server = http.createServer((req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 只处理 POST 请求到 /proxy 路径
    if (req.method === 'POST' && req.url === '/proxy') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { webhookUrl, message } = data;

                if (!webhookUrl || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        errcode: -1, 
                        errmsg: '缺少必要参数：webhookUrl 或 message' 
                    }));
                    return;
                }

                // 解析 webhook URL
                const targetUrl = new URL(webhookUrl);
                const options = {
                    hostname: targetUrl.hostname,
                    port: targetUrl.port || 443,
                    path: targetUrl.pathname + targetUrl.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(message))
                    }
                };

                console.log(`[代理] 转发请求到: ${webhookUrl}`);

                // 创建到企业微信的请求
                const proxyReq = https.request(options, (proxyRes) => {
                    let responseData = '';

                    proxyRes.on('data', (chunk) => {
                        responseData += chunk;
                    });

                    proxyRes.on('end', () => {
                        res.writeHead(proxyRes.statusCode, {
                            'Content-Type': 'application/json'
                        });
                        res.end(responseData);
                    });
                });

                proxyReq.on('error', (error) => {
                    console.error('[代理] 请求错误:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        errcode: -1, 
                        errmsg: `代理请求失败: ${error.message}` 
                    }));
                });

                // 发送请求体
                proxyReq.write(JSON.stringify(message));
                proxyReq.end();

            } catch (error) {
                console.error('[代理] 解析错误:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    errcode: -1, 
                    errmsg: `请求解析失败: ${error.message}` 
                }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errcode: -1, errmsg: 'Not Found' }));
    }
});

server.listen(PROXY_PORT, () => {
    console.log('========================================');
    console.log('  企业微信 API 代理服务器已启动');
    console.log(`  监听端口: ${PROXY_PORT}`);
    console.log('  代理地址: http://localhost:' + PROXY_PORT + '/proxy');
    console.log('========================================');
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[错误] 端口 ${PROXY_PORT} 已被占用`);
    } else {
        console.error('[错误] 服务器启动失败:', error);
    }
    process.exit(1);
});

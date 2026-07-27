/* ============================================
 * 卓盟智办公 PWA - Service Worker V4.0.0
 * 四川卓盟科技有限公司
 * ============================================ */

const CACHE_NAME = 'zhuomeng-office-v4.0.0';
const STATIC_CACHE = 'zhuomeng-static-v4.0.0';
const DYNAMIC_CACHE = 'zhuomeng-dynamic-v4.0.0';

// 需要预缓存的静态资源列表（全部本地化，无CDN依赖）
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/api.js',
    '/vendor/font-awesome/css/font-awesome.min.css',
    '/vendor/font-awesome/fonts/fontawesome-webfont.eot',
    '/vendor/font-awesome/fonts/fontawesome-webfont.svg',
    '/vendor/font-awesome/fonts/fontawesome-webfont.ttf',
    '/vendor/font-awesome/fonts/fontawesome-webfont.woff',
    '/vendor/font-awesome/fonts/fontawesome-webfont.woff2',
    '/vendor/font-awesome/fonts/FontAwesome.otf',
    '/vendor/chart.js/chart.umd.min.js',
    '/mobile/manifest.json',
    '/mobile/icons/icon-192x192.png',
    '/mobile/icons/icon-512x512.png'
];

// 已本地化，不再有CDN外部资源
// 所有资源均通过本地服务器提供

// 安装事件 - 预缓存核心资源
self.addEventListener('install', (event) => {
    console.log('[SW] 安装 Service Worker V4.0.0');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] 预缓存本地资源');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// 激活事件 - 清理所有旧缓存（强制更新）
self.addEventListener('activate', (event) => {
    console.log('[SW] 激活 Service Worker V4.0.0 - 清理旧缓存');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map((name) => {
                            console.log('[SW] 删除旧缓存:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// 请求拦截 - 缓存策略
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 只处理GET请求和同源请求
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // API请求不缓存（需要实时数据）
    if (url.pathname.startsWith('/api/')) return;

    // 静态资源策略：Stale-While-Revalidate（先返回缓存，同时后台更新）
    if (PRECACHE_URLS.some(u => url.pathname === u || url.pathname.endsWith(u.split('/').pop()))) {
        event.respondWith(
            caches.match(request)
                .then((cached) => {
                    // 后台更新缓存
                    const fetchPromise = fetch(request)
                        .then((response) => {
                            if (response && response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
                            }
                            return response;
                        })
                        .catch(() => cached); // 网络失败时忽略（已有缓存兜底）

                    // 有缓存就用缓存（快），同时后台刷新
                    return cached || fetchPromise;
                })
        );
        return;
    }

    // 其他本地资源：Network First（网络优先，失败回退缓存）
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(request)
                    .then((cached) => {
                        if (cached) return cached;
                        // 离线时返回首页
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                        return new Response('离线模式 - 资源暂不可用', { status: 503, statusText: 'Offline' });
                    });
            })
    );
});

// 推送通知处理
self.addEventListener('push', (event) => {
    const options = {
        icon: '/mobile/icons/icon-192x192.png',
        badge: '/mobile/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: { dateOfArrival: Date.now() }
    };

    if (event.data) {
        const data = event.data.json();
        options.body = data.body || '您有新的工作通知';
        options.title = data.title || '卓盟智办公通知';
        options.data.url = data.url || '/index.html';
    } else {
        options.title = '卓盟智办公通知';
        options.body = '您有新的工作消息，请查看';
    }

    event.waitUntil(self.registration.showNotification(options.title, options));
});

// 点击通知后打开应用
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/index.html';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                for (const client of windowClients) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(urlToOpen);
                }
            })
    );
});

// 后台同步
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-checkin-data') {
        console.log('[SW] 同步打卡数据');
    }
    if (event.tag === 'sync-report-data') {
        console.log('[SW] 同步汇报数据');
    }
});

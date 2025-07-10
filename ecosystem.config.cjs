module.exports = {
    apps: [
        {
            name: 'app-server',
            script: 'bun',
            args: 'run dist/server.js',
            interpreter: 'none'
        },
        {
            name: 'app-worker',
            script: 'bun',
            args: 'run dist/worker.js',
            interpreter: 'none'
        }
    ]
};
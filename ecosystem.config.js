module.exports = {
    apps : [
        {
            name: "ogn",
            script: "./bin/ogn.js",
            restart_delay : 30000,
            max_restarts: 1000,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        },
        {
            name: "next",
            script: "./node_modules/.bin/next start",
            restart_delay: 100,
            max_restarts: 10,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        },
        {
            name: "soaringspot",
            script: "./bin/soaringspot.js",
            restart_delay: 120000,
            max_restarts: 30,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        }
    ]
}

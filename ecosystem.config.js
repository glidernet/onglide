module.exports = {
    apps : [
        {
            name: "ogn",
            script: "yarn ogn",
            restart_delay : 30000,
            max_restarts: 1000,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        },
        {
            name: "next",
            script: "yarn next start",
            restart_delay: 100,
            max_restarts: 10,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        },
        {
            name: "soaringspot",
            script: "yarn soaringspot",
            restart_delay: 120000,
            max_restarts: 30,
            autorestart: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        }
    ]
}

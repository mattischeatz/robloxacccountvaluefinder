
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

app.disable("x-powered-by");

// ==========================================
// CONFIGURATION
// ==========================================

const MAX_INVENTORY_PAGES = 100;
const MAX_GAME_PAGES = 100;

const CACHE_DURATION = 5 * 60 * 1000;

const cache = new Map();

// ==========================================
// ROBLOX API REQUEST
// ==========================================

async function robloxRequest(url) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "RobloxAccountValueFinder/1.0",
            "Accept": "application/json"
        },
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(
            `Roblox API returned ${response.status}`
        );
    }

    return response.json();
}

// ==========================================
// HOMEPAGE
// ==========================================

app.get("/", (req, res) => {
    res.json({
        name: "Roblox Account Value Finder",
        status: "online",
        version: "1.0.0",
        endpoints: {
            health: "/healthz",
            stats: "/stats/:userId"
        }
    });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/healthz", (req, res) => {
    res.status(200).send("OK");
});

// ==========================================
// INVENTORY VALUE
// ==========================================

async function getInventoryValue(userId) {
    let cursor = null;
    let totalValue = 0;
    let pages = 0;

    do {
        const url = new URL(
            `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles`
        );

        url.searchParams.set("limit", "100");
        url.searchParams.set("sortOrder", "Asc");

        if (cursor) {
            url.searchParams.set("cursor", cursor);
        }

        const data = await robloxRequest(url);

        for (const item of data.data || []) {
            const price = Number(
                item.recentAveragePrice ??
                item.originalPrice ??
                0
            );

            if (Number.isFinite(price) && price > 0) {
                totalValue += price;
            }
        }

        cursor = data.nextPageCursor;
        pages++;

    } while (cursor && pages < MAX_INVENTORY_PAGES);

    return {
        value: totalValue,
        complete: !cursor,
        pages
    };
}

// ==========================================
// DEVELOPER VISITS
// ==========================================

async function getDeveloperVisits(userId) {
    let cursor = null;
    let totalVisits = 0;
    let pages = 0;

    do {
        const url = new URL(
            `https://games.roblox.com/v2/users/${userId}/games`
        );

        url.searchParams.set("accessFilter", "Public");
        url.searchParams.set("sortOrder", "Asc");
        url.searchParams.set("limit", "50");

        if (cursor) {
            url.searchParams.set("cursor", cursor);
        }

        const data = await robloxRequest(url);

        for (const game of data.data || []) {
            if (game.creator?.id === userId) {
                totalVisits += Number(game.placeVisits || game.visits || 0);
            }
        }

        cursor = data.nextPageCursor;
        pages++;

    } while (cursor && pages < MAX_GAME_PAGES);

    return {
        value: totalVisits,
        complete: !cursor,
        pages
    };
}

// ==========================================
// PROFILE STATISTICS
// ==========================================

async function getProfileStats(userId) {
    const cached = cache.get(userId);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }

    const [inventory, games] = await Promise.all([
        getInventoryValue(userId),
        getDeveloperVisits(userId)
    ]);

    const result = {
        userId,
        networth: inventory.value,
        visits: games.value,
        inventoryComplete: inventory.complete,
        gamesComplete: games.complete,
        inventoryPages: inventory.pages,
        gamePages: games.pages,
        updatedAt: new Date().toISOString()
    };

    cache.set(userId, {
        timestamp: Date.now(),
        data: result
    });

    return result;
}

// ==========================================
// STATISTICS ENDPOINT
// ==========================================

app.get("/stats/:userId", async (req, res) => {
    // Authentication
    if (!API_SECRET) {
        return res.status(500).json({
            success: false,
            error: "API_SECRET is not configured."
        });
    }

    if (req.headers["x-api-key"] !== API_SECRET) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
    }

    // Validate Roblox user ID
    const userId = Number(req.params.userId);

    if (
        !Number.isSafeInteger(userId) ||
        userId <= 0
    ) {
        return res.status(400).json({
            success: false,
            error: "Invalid Roblox user ID"
        });
    }

    try {
        const stats = await getProfileStats(userId);

        res.json({
            success: true,
            ...stats
        });

    } catch (error) {
        console.error("Statistics error:", error);

        res.status(502).json({
            success: false,
            error: "Failed to retrieve Roblox statistics.",
            details: error.message
        });
    }
});

// ==========================================
// 404 HANDLER
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found"
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log("--------------------------------");
    console.log("Roblox Account Value Finder");
    console.log("Server running on port " + PORT);
    console.log("--------------------------------");
});

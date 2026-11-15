
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.API_SECRET;

app.get("/stats/:userId", async (req, res) => {
    if (!SECRET || req.headers["x-api-key"] !== SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = Number(req.params.userId);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
    }

    try {
        let networth = 0;
        let visits = 0;

        // Fetch collectible inventory
        let cursor = null;
        let inventoryPages = 0;

        do {
            const url = new URL(
                `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles`
            );

            url.searchParams.set("limit", "100");
            url.searchParams.set("sortOrder", "Asc");

            if (cursor) {
                url.searchParams.set("cursor", cursor);
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Inventory API error: " + response.status);
            }

            const data = await response.json();

            for (const item of data.data || []) {
                networth += Number(
                    item.recentAveragePrice ||
                    item.originalPrice ||
                    0
                );
            }

            cursor = data.nextPageCursor;
            inventoryPages++;

        } while (cursor && inventoryPages < 20);

        // Fetch games and total visits
        cursor = null;
        let gamePages = 0;

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

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Games API error: " + response.status);
            }

            const data = await response.json();

            for (const game of data.data || []) {
                if (game.creator?.id === userId) {
                    visits += Number(game.visits || 0);
                }
            }

            cursor = data.nextPageCursor;
            gamePages++;

        } while (cursor && gamePages < 20);

        res.json({
            networth,
            visits,
            inventoryComplete: !cursor,
            gamesComplete: !cursor
        });

    } catch (error) {
        console.error(error);

        res.status(502).json({
            error: "Unable to retrieve Roblox statistics"
        });
    }
});

app.listen(PORT, () => {
    console.log("Profile stats API running on port " + PORT);
});

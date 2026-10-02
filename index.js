require("dotenv").config();

const {
    Client,
    GatewayIntentBits
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require("@discordjs/voice");

const { spawn } = require("child_process");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const prefix = "!";

const queues = new Map();

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // =========================
    // !hello
    // =========================
    if (command === "hello") {
        await message.reply("Hello!");
        return;
    }

    // =========================
    // !play
    // =========================
    if (command === "play") {
        const query = args.join(" ");

        if (!query) {
            await message.reply("Please enter a song name.");
            return;
        }

        const voiceChannel = message.member?.voice?.channel;

        if (!voiceChannel) {
            await message.reply("You need to join a voice channel first.");
            return;
        }

        try {
            let connection = getConnection(message.guild.id);

            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true
                });

                await entersState(
                    connection,
                    VoiceConnectionStatus.Ready,
                    30_000
                );

                console.log(
                    `Connected to voice channel 🔊┃${voiceChannel.name} in guild ${message.guild.id}`
                );
            }

            let playerData = queues.get(message.guild.id);

            if (!playerData) {
                const player = createAudioPlayer();

                playerData = {
                    connection,
                    player,
                    queue: [],
                    playing: false,
                    playbackId: 0,
                    ytProcess: null
                };

                queues.set(message.guild.id, playerData);

                connection.subscribe(player);

                player.on(AudioPlayerStatus.Idle, () => {
                    console.log(
                        `Audio player is idle in guild ${message.guild.id}`
                    );

                    playerData.playing = false;
                });

                player.on("error", (error) => {
                    console.error(
                        `Audio player error in guild ${message.guild.id}:`,
                        error
                    );

                    playerData.playing = false;
                });
            }

            playerData.queue.push({
                query,
                requestedBy: message.author
            });

            await message.reply(`Added **${query}** to the queue.`);

            if (!playerData.playing) {
                await playNext(message.guild.id, message.channel);
            }

        } catch (error) {
            console.error("Play command error:", error);

            await message.reply(
                "There was an error trying to play that song."
            );
        }

        return;
    }

    // =========================
    // !skip
    // =========================
    if (command === "skip") {
        const playerData = queues.get(message.guild.id);

        if (!playerData) {
            await message.reply("Nothing is playing.");
            return;
        }

        if (playerData.ytProcess) {
            playerData.ytProcess.kill("SIGKILL");
            playerData.ytProcess = null;
        }

        playerData.player.stop();

        await message.reply("Skipped.");
        return;
    }

    // =========================
    // !stop
    // =========================
    if (command === "stop") {
        const playerData = queues.get(message.guild.id);

        if (!playerData) {
            await message.reply("Nothing is playing.");
            return;
        }

        playerData.queue = [];

        if (playerData.ytProcess) {
            playerData.ytProcess.kill("SIGKILL");
            playerData.ytProcess = null;
        }

        playerData.player.stop();

        await message.reply("Stopped the music and cleared the queue.");
        return;
    }

    // =========================
    // !queue
    // =========================
    if (command === "queue") {
        const playerData = queues.get(message.guild.id);

        if (!playerData || playerData.queue.length === 0) {
            await message.reply("The queue is empty.");
            return;
        }

        const queueText = playerData.queue
            .map((song, index) => `${index + 1}. ${song.query}`)
            .join("\n");

        await message.reply(`**Music Queue:**\n${queueText}`);
        return;
    }

    // =========================
    // !leave
    // =========================
    if (command === "leave") {
        const playerData = queues.get(message.guild.id);

        if (!playerData) {
            await message.reply("I'm not in a voice channel.");
            return;
        }

        if (playerData.ytProcess) {
            playerData.ytProcess.kill("SIGKILL");
            playerData.ytProcess = null;
        }

        playerData.player.stop();

        playerData.connection.destroy();

        queues.delete(message.guild.id);

        await message.reply("Left the voice channel.");
        return;
    }
});


// =====================================================
// PLAY NEXT SONG
// =====================================================

async function playNext(guildId, textChannel) {
    const playerData = queues.get(guildId);

    if (!playerData) return;

    if (playerData.queue.length === 0) {
        playerData.playing = false;
        return;
    }

    const song = playerData.queue.shift();

    playerData.playing = true;
    playerData.playbackId++;

    const playbackId = playerData.playbackId;

    console.log(
        `Searching YouTube for: ${song.query}`
    );

    try {
        // =============================================
        // SEARCH YOUTUBE
        // =============================================

        const searchProcess = spawn("yt-dlp", [
            `ytsearch1:${song.query}`,
            "--flat-playlist",
            "--print",
            "%(title)s",
            "--print",
            "%(webpage_url)s",
            "--no-warnings"
        ]);

        let searchOutput = "";
        let searchError = "";

        searchProcess.stdout.on("data", (data) => {
            searchOutput += data.toString();
        });

        searchProcess.stderr.on("data", (data) => {
            searchError += data.toString();
        });

        await new Promise((resolve, reject) => {
            searchProcess.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            `yt-dlp search failed with code ${code}\n${searchError}`
                        )
                    );
                }
            });

            searchProcess.on("error", reject);
        });

        const lines = searchOutput
            .trim()
            .split("\n")
            .filter(Boolean);

        if (lines.length < 2) {
            throw new Error("No YouTube result found.");
        }

        const title = lines[0];
        const url = lines[1];

        console.log(`Found: ${title}`);

        console.log(
            `Playing playback #${playbackId} in guild ${guildId}: ${title}`
        );

        console.log(
            `Starting audio stream for guild ${guildId}...`
        );

        // =============================================
        // YT-DLP
        //
        // Output Opus directly.
        // This avoids @discordjs/opus.
        // =============================================

        const ytProcess = spawn("yt-dlp", [
            url,

            "-f",
            "bestaudio[acodec=opus]/bestaudio",

            "--extract-audio",

            "--audio-format",
            "opus",

            "--audio-quality",
            "0",

            "--output",
            "-",

            "--no-playlist",

            "--no-warnings",

            "--quiet",

            "--no-progress"
        ], {
            stdio: ["ignore", "pipe", "pipe"]
        });

        playerData.ytProcess = ytProcess;

        let ytError = "";

        ytProcess.stderr.on("data", (data) => {
            const output = data.toString();

            ytError += output;

            console.log(
                `yt-dlp: ${output.trim()}`
            );
        });

        ytProcess.stdout.once("data", () => {
            console.log(
                `yt-dlp started sending audio data in guild ${guildId}`
            );
        });

        // =============================================
        // IMPORTANT
        //
        // yt-dlp gives us Opus audio.
        // Discord can use Webm/Opus directly.
        // No Opus encoder package is needed.
        // =============================================

        const resource = createAudioResource(
            ytProcess.stdout,
            {
                inputType: StreamType.WebmOpus
            }
        );

        playerData.player.play(resource);

        console.log(
            `Audio resource started in guild ${guildId}`
        );

        // =============================================
        // WHEN YT-DLP FINISHES
        // =============================================

        ytProcess.on("close", async (code) => {
            console.log(
                `yt-dlp process closed with code ${code} in guild ${guildId}`
            );

            if (playerData.ytProcess === ytProcess) {
                playerData.ytProcess = null;
            }

            // Give Discord a moment to finish the Opus stream.
            setTimeout(async () => {
                if (!playerData.playing) {
                    return;
                }

                playerData.playing = false;

                await playNext(guildId, textChannel);
            }, 1000);
        });

        ytProcess.on("error", async (error) => {
            console.error(
                `yt-dlp process error in guild ${guildId}:`,
                error
            );

            playerData.ytProcess = null;
            playerData.playing = false;

            await playNext(guildId, textChannel);
        });

    } catch (error) {
        console.error(
            `Playback error in guild ${guildId}:`,
            error
        );

        playerData.playing = false;

        if (playerData.ytProcess) {
            playerData.ytProcess.kill("SIGKILL");
            playerData.ytProcess = null;
        }

        await playNext(guildId, textChannel);
    }
}


// =====================================================
// GET EXISTING VOICE CONNECTION
// =====================================================

function getConnection(guildId) {
    const playerData = queues.get(guildId);

    if (playerData) {
        return playerData.connection;
    }

    return null;
}


// =====================================================
// LOGIN
// =====================================================

client.login(process.env.TOKEN);

const fs = require("fs");

const input = "cookies.txt";
const chunkSize = 25000;

const content = fs.readFileSync(input, "utf8");
const total = Math.ceil(content.length / chunkSize);

for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const chunk = content.slice(start, start + chunkSize);

    fs.writeFileSync(
        `cookies_${i + 1}.txt`,
        chunk,
        "utf8"
    );
}

console.log(`Done! Created ${total} cookie files.`);

function slugify(text) {
    try {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')     // Replace spaces with -
            .replace(/[^\w\-]+/g, '') // Remove all non-word chars
            .replace(/\-\-+/g, '-');  // Replace multiple - with single -
    } catch (e) {
        console.log('Error in slugify:', e);
        throw e;
    }
}

console.log("Testing slugify(undefined)...");
try {
    slugify(undefined);
} catch (e) {
    console.log("Caught:", e);
}

console.log("\nTesting slugify(null)...");
try {
    slugify(null);
} catch (e) {
    console.log("Caught:", e);
}


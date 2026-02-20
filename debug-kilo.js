const fs = require("fs")
const path = require("path")
const os = require("os")
const { createRequire } = require("module")

const platformMap = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
}
const archMap = {
    x64: "x64",
    arm64: "arm64",
    arm: "arm",
}

let platform = platformMap[os.platform()]
if (!platform) platform = os.platform()

let arch = archMap[os.arch()]
if (!arch) arch = os.arch()

const base = "@kilocode/cli-" + platform + "-" + arch
const binary = platform === "windows" ? "kilo.exe" : "kilo"

console.log(`Platform: ${platform}, Arch: ${arch}, Base: ${base}, Binary: ${binary}`)

function findBinary() {
    const req = createRequire(__filename)
    try {
        const pkgPath = req.resolve(base + "/package.json")
        console.log(`Package Path Found: ${pkgPath}`)
        const pkgDir = path.dirname(pkgPath)
        const candidate = path.join(pkgDir, "bin", binary)
        console.log(`Candidate Path: ${candidate}`)
        if (fs.existsSync(candidate)) {
            return candidate
        } else {
            console.log("Candidate does not exist")
        }
    } catch (e) {
        console.log(`Error resolving package: ${e.message}`)
    }
}

const resolved = findBinary()
if (!resolved) {
    console.log("Binary NOT resolved")
} else {
    console.log(`Binary resolved to: ${resolved}`)
}

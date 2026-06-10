import fs from 'fs';

export async function uploadBufferToPinata(buffer, fileName, mimeType = 'application/pdf') {
    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('pinataMetadata', JSON.stringify({ name: fileName }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            'pinata_api_key': process.env.PINATA_API_KEY,
            'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
        },
        body: formData,
    });

    if (!res.ok) throw new Error(`Pinata file upload failed: ${await res.text()}`);
    return await res.json();
}

export async function uploadFileToPinata(filePath, fileName) {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('pinataMetadata', JSON.stringify({ name: fileName }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            'pinata_api_key': process.env.PINATA_API_KEY,
            'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
        },
        body: formData,
    });

    if (!res.ok) throw new Error(`Pinata file upload failed: ${await res.text()}`);
    return await res.json();
}

export async function uploadJSONToPinata(jsonData, name) {
    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': process.env.PINATA_API_KEY,
            'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
        },
        body: JSON.stringify({ pinataContent: jsonData, pinataMetadata: { name } }),
    });

    if (!res.ok) throw new Error(`Pinata JSON upload failed: ${await res.text()}`);
    return await res.json();
}

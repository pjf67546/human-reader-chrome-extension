const setStorageItem = async (key, value) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

const readStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, function (result) {
      resolve(result);
    });
  });
};

const getNextApiKey = async () => {
  const storage = await readStorage(["apiKeys", "apiKeyIndex", "apiKey"]);
  if (storage.apiKeys && storage.apiKeys.length > 0) {
    const index = storage.apiKeyIndex || 0;
    const apiKey = storage.apiKeys[index % storage.apiKeys.length];
    await setStorageItem(
      "apiKeyIndex",
      (index + 1) % storage.apiKeys.length
    );
    return apiKey;
  }
  return storage.apiKey;
};

const setWelcomeScreen = () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  const info = document.getElementById("info");
  settings.style.display = "none";
  welcome.style.display = "block";
  info.style.display = "none";
};

const setSettingsScreen = async () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  const info = document.getElementById("info");
  settings.style.display = "block";
  welcome.style.display = "none";
  info.style.display = "block";

  //assumes storage is already set
  storage = await readStorage(["mode", "speed"]);
  document.getElementById("mode").value = storage.mode;
  setSpeedValue(storage.speed || 1);
  await populateApiKeys();
};

const setSpeedValue = (value) => {
  document.getElementById("speedInput").value = value;
  document.getElementById("speedValue").textContent = value + "x";
};

const loadStartupData = async () => {
  await fetchModels();
  const voices = await fetchVoices();
  storage = await readStorage([
    "apiKey",
    "selectedVoiceId",
    "mode",
    "voices",
    "speed",
  ]);
  const mode = storage.mode || "eleven_turbo_v2_5";
  document.getElementById("mode").value = mode;
  const speedValue = storage.speed || 1;
  setSpeedValue(speedValue);

  const selectedVoiceId = storage.selectedVoiceId || voices[0].id;
  setStorageItem("selectedVoiceId", selectedVoiceId);
  setStorageItem("mode", mode);
};

const populateVoices = async () => {
  const storage = await readStorage(["voices", "selectedVoiceId"]);
  const voices = storage.voices;
  if (voices) {
    const select = document.getElementById("voices");

    select.innerHTML = ""; // Clear existing options

    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.text = voice.name;
      select.appendChild(option);
    });
    const selectedVoiceId = storage.selectedVoiceId;
    if (selectedVoiceId) select.value = selectedVoiceId;
  }
};

const populateModels = async () => {
  const storage = await readStorage(["models", "mode"]);
  const models = storage.models;
  if (models) {
    const select = document.getElementById("mode");
    select.innerHTML = "";
    models.forEach((m) => {
      const option = document.createElement("option");
      option.value = m.id;
      option.text = m.name;
      select.appendChild(option);
    });
    if (storage.mode) select.value = storage.mode;
  }
};

const populateApiKeys = async () => {
  const storage = await readStorage(["apiKeys", "apiKey"]);
  const field = document.getElementById("storedApiKeys");
  if (field) {
    const keys =
      storage.apiKeys && storage.apiKeys.length > 0
        ? storage.apiKeys.join("\n")
        : storage.apiKey || "";
    field.value = keys;
  }
};

const setAPIKeys = async (apiKeysInput) => {
  const keys = apiKeysInput
    .split(/[,\n]+/)
    .map((k) => k.trim())
    .filter((k) => k);
  const validKeys = [];
  for (const key of keys) {
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      method: "GET",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
    });
    if (response.ok) {
      validKeys.push(key);
    }
  }
  if (validKeys.length === 0) {
    throw new Error("API request failed");
  }
  await setStorageItem("apiKeys", validKeys);
  await setStorageItem("apiKeyIndex", 0);
  await setStorageItem("apiKey", validKeys[0]);
};

const fetchModels = async () => {
  const apiKey = await getNextApiKey();
  if (apiKey) {
    let response = await fetch("https://api.elevenlabs.io/v1/models", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.models) {
        const models = data.models.map((m) => ({
          id: m.model_id,
          name: m.name,
        }));
        await setStorageItem("models", models);
        await populateModels();
        return models;
      }
    }
  }
};

const fetchVoices = async () => {
  const storage = await readStorage(["selectedVoiceId", "mode"]);
  const apiKey = await getNextApiKey();
  if (apiKey) {
    let response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        chrome.storage.local.clear();
        throw new Error("Invalid API key");
      } else {
        console.error(`HTTP error! status: ${response.status}`);
      }
    } else {
      response = await response.json();
      if (response.voices) {
        const voices = response.voices.map((voice) => {
          return {
            id: voice.voice_id,
            name: voice.name,
          };
        });
        await setStorageItem("voices", voices);
        await populateVoices();
        return voices;
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await readStorage(["apiKeys", "apiKey"]);
  if ((storage.apiKeys && storage.apiKeys.length > 0) || storage.apiKey) {
    populateVoices();
    populateModels();
    populateApiKeys();
    setSettingsScreen();
  } else {
    setWelcomeScreen();
  }
});

const select = document.getElementById("voices");
select.addEventListener("change", async (event) => {
  const selectedVoiceId = event.target.value;
  await setStorageItem("selectedVoiceId", selectedVoiceId);
});

document.getElementById("setApiKey").addEventListener("click", async () => {
  const button = document.getElementById("setApiKey");
  const inputValue = document.getElementById("apiKey").value;
  button.textContent = "...";
  try {
    await setAPIKeys(inputValue);
    await loadStartupData();
    await setSettingsScreen();
    await populateApiKeys();
    button.textContent = "Set";
  } catch (error) {
    console.log(error);
    chrome.storage.local.clear();
    button.textContent = "Set";
    setWelcomeScreen();
    alert("Invalid API key, please try again.");
    console.error(error);
  }
});

document.getElementById("mode").addEventListener("change", async () => {
  const mode = document.getElementById("mode").value;
  await setStorageItem("mode", mode);
});

document.getElementById("speedInput").addEventListener("input", async (e) => {
  const value = document.getElementById("speedInput").value;
  setSpeedValue(value);
  await setStorageItem("speed", value);
});

document.getElementById("clearStorage").addEventListener("click", function () {
  if (
    confirm(
      "Are you sure you want to clear your data? This will remove your API key and all your settings."
    )
  ) {
    chrome.storage.local.clear();
    setWelcomeScreen();
    document.getElementById("apiKey").value = "";
  }
});

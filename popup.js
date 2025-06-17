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
};

const setSpeedValue = (value) => {
  document.getElementById("speedInput").value = value;
  document.getElementById("speedValue").textContent = value + "x";
};

const loadStartupData = async () => {
  const voices = await fetchVoices();
  await fetchModels();
  storage = await readStorage([
    "apiKeys",
    "apiKey",
    "selectedVoiceId",
    "mode",
    "voices",
    "speed",
  ]);
  const mode =
    storage.mode ||
    (storage.models && storage.models.length > 0
      ? storage.models[0].model_id
      : "eleven_turbo_v2_5");
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

const setAPIKeys = async (apiKeys) => {
  const validKeys = [];
  for (const key of apiKeys) {
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
  if (validKeys.length > 0) {
    await setStorageItem("apiKeys", validKeys);
    return true;
  } else {
    throw new Error("No valid API keys provided");
  }
};

const fetchWithApiKeys = async (url, options, apiKeys) => {
  for (const key of apiKeys) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), "xi-api-key": key },
    });
    if (response.ok) {
      return response;
    }
  }
  throw new Error("All API keys failed");
};

const fetchVoices = async () => {
  const storage = await readStorage(["apiKeys", "apiKey"]);
  const apiKeys = storage.apiKeys || (storage.apiKey ? [storage.apiKey] : []);
  if (apiKeys.length === 0) return;
  let response = await fetchWithApiKeys(
    "https://api.elevenlabs.io/v1/voices",
    { method: "GET", headers: { "Content-Type": "application/json" } },
    apiKeys
  );

  if (response && response.ok) {
    response = await response.json();
    if (response.voices) {
      const voices = response.voices.map((voice) => {
        return { id: voice.voice_id, name: voice.name };
      });
      await setStorageItem("voices", voices);
      await populateVoices();
      return voices;
    }
  }
};

const fetchModels = async () => {
  const storage = await readStorage(["apiKeys", "apiKey"]);
  const apiKeys = storage.apiKeys || (storage.apiKey ? [storage.apiKey] : []);
  if (apiKeys.length === 0) return [];
  let response = await fetchWithApiKeys(
    "https://api.elevenlabs.io/v1/models",
    { method: "GET", headers: { "Content-Type": "application/json" } },
    apiKeys
  );
  if (response && response.ok) {
    const json = await response.json();
    if (json.models) {
      await setStorageItem("models", json.models);
      await populateModels();
      return json.models;
    }
  }
  return [];
};

const populateModels = async () => {
  const storage = await readStorage(["models", "mode"]);
  const models = storage.models || [];
  const select = document.getElementById("mode");
  select.innerHTML = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.model_id;
    option.text = model.name;
    select.appendChild(option);
  });
  if (storage.mode) select.value = storage.mode;
};

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await readStorage(["apiKeys", "apiKey"]);
  if (storage.apiKeys || storage.apiKey) {
    await populateVoices();
    await fetchModels();
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
  const inputValue = document.getElementById("apiKeys").value;
  const keys = inputValue
    .split(/\n|,/)
    .map((k) => k.trim())
    .filter((k) => k);
  button.textContent = "...";
  try {
    await setAPIKeys(keys);
    await loadStartupData();
    await fetchModels();
    await setSettingsScreen();
    button.textContent = "Set";
  } catch (error) {
    console.log(error);
    chrome.storage.local.clear();
    button.textContent = "Set";
    setWelcomeScreen();
    alert("Invalid API key(s), please try again.");
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
    document.getElementById("apiKeys").value = "";
  }
});

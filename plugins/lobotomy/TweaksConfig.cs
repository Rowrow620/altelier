using System;
using System.IO;
using UnityEngine;

namespace AtelierLobotomyTweaks
{
    public sealed class TweaksConfig
    {
        public bool UnlimitedLob;
        public bool UnlimitedEgo;
        public bool UnlockAllEgos;
        public bool KeepAgentsForever;
        public int SpeedMultiplier;

        public static TweaksConfig Load(string assemblyLocation)
        {
            var cfg = new TweaksConfig();
            try
            {
                if (string.IsNullOrEmpty(assemblyLocation)) return cfg;
                var asmDir = Path.GetDirectoryName(assemblyLocation);
                var modRoot = asmDir != null ? Path.GetDirectoryName(asmDir) : null;
                string[] candidates = {
                    asmDir != null ? Path.Combine(asmDir, "tweaks.cfg") : null,
                    modRoot != null ? Path.Combine(modRoot, "tweaks.cfg") : null,
                };
                foreach (var path in candidates)
                {
                    if (string.IsNullOrEmpty(path) || !File.Exists(path)) continue;
                    foreach (var raw in File.ReadAllLines(path))
                    {
                        var line = raw.Trim();
                        if (line.Length == 0 || line.StartsWith("#")) continue;
                        var eq = line.IndexOf('=');
                        if (eq <= 0) continue;
                        var key = line.Substring(0, eq).Trim();
                        var val = line.Substring(eq + 1).Trim();
                        if (key.Equals("UnlimitedLob", StringComparison.OrdinalIgnoreCase)) cfg.UnlimitedLob = IsTrue(val);
                        else if (key.Equals("UnlimitedEgo", StringComparison.OrdinalIgnoreCase)) cfg.UnlimitedEgo = IsTrue(val);
                        else if (key.Equals("UnlockAllEgos", StringComparison.OrdinalIgnoreCase)) cfg.UnlockAllEgos = IsTrue(val);
                        else if (key.Equals("KeepAgentsForever", StringComparison.OrdinalIgnoreCase)) cfg.KeepAgentsForever = IsTrue(val);
                        else if (key.Equals("SpeedMultiplier", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var spd) && spd >= 0) cfg.SpeedMultiplier = spd;
                    }
                    break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[AtelierLobotomyTweaks] Config load failed: " + ex);
            }
            return cfg;
        }

        private static bool IsTrue(string val) =>
            val.Equals("true", StringComparison.OrdinalIgnoreCase) || val == "1";
    }
}

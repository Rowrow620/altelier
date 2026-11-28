using System;
using System.IO;
using UnityEngine;

namespace AtelierTweaks
{
    public sealed class TweaksConfig
    {
        public bool NoGrindBooks;
        public bool NoGrindBurnCards;
        public int NoGrindAmount = 999;
        public bool MultiplePurpleBooks;
        public bool MultipleGoldBooks;
        public bool MultipleCommonBooks;
        public int KeyPageLimit = 99;

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
                        if (key.Equals("NoGrindBooks", StringComparison.OrdinalIgnoreCase) || key.Equals("NoGrindDrops", StringComparison.OrdinalIgnoreCase))
                            cfg.NoGrindBooks = IsTrue(val);
                        else if (key.Equals("NoGrindBurnCards", StringComparison.OrdinalIgnoreCase))
                            cfg.NoGrindBurnCards = IsTrue(val);
                        else if (key.Equals("NoGrindAmount", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var amt) && amt > 0)
                            cfg.NoGrindAmount = amt;
                        else if (key.Equals("MultiplePurpleBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultiplePurpleBooks = IsTrue(val);
                        else if (key.Equals("MultipleGoldBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultipleGoldBooks = IsTrue(val);
                        else if (key.Equals("MultipleCommonBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultipleCommonBooks = IsTrue(val);
                        else if (key.Equals("KeyPageLimit", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var lim) && lim > 0)
                            cfg.KeyPageLimit = lim;
                    }
                    break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[AtelierTweaks] Config load failed: " + ex);
            }
            return cfg;
        }

        private static bool IsTrue(string val) =>
            val.Equals("true", StringComparison.OrdinalIgnoreCase) || val == "1";
    }
}

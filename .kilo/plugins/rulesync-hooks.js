export default {
  id: "rulesync-hooks",
  server: async ({ $ }) => {
    return {
      "tool.execute.before": async (input) => {
        {
          const __re = new RegExp("Bash");
          if (__re.test(input.tool)) {
            await $`.rulesync/hooks/security-guard.sh`;
          }
        }
      },
    };
  },
};

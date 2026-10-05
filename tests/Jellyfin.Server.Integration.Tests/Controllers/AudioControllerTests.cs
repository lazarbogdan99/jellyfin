using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Server.Integration.Tests.Controllers;

public sealed class AudioControllerTests : IClassFixture<JellyfinApplicationFactory>
{
    private readonly JellyfinApplicationFactory _factory;
    private static string? _accessToken;

    public AudioControllerTests(JellyfinApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp3")]
    public async Task GetAudioStream_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"Audio/{Guid.NewGuid()}/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp3")]
    public async Task HeadAudioStream_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Head, $"Audio/{Guid.NewGuid()}/{route}");
        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp3")]
    public async Task GetAudioStream_NonexistentItemId_NotFound(string route)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.GetAsync($"Audio/{Guid.NewGuid()}/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

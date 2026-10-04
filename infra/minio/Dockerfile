FROM golang:1.24@sha256:d2d2bc1c84f7e60d7d2438a3836ae7d0c847f4888464e7ec9ba3a1339a1ee804 AS build
# MinIO RELEASE.2025-10-15T17-29-55Z, built from its official source.
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
RUN mkdir /data && chown 1000:1000 /data

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/minio /minio
COPY --from=build --chown=1000:1000 /data /data
USER 1000:1000
EXPOSE 9000 9001
ENTRYPOINT ["/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
